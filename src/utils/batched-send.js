const functionBatch = require('function-batch')

// ABI for transaction batcher contract.
const ABI = [
  {
    constant: false,
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'datas', type: 'bytes[]' }
    ],
    name: 'batchSend',
    outputs: [],
    payable: true,
    stateMutability: 'payable',
    type: 'function'
  }
]

module.exports = (
  web3,
  transactionBatcherContractAddress,
  privateKey,
  wait // The batch time window.
) => {
  // Instantiate the transaction batcher contract.
  const transactionBatcher = new web3.eth.Contract(
    ABI,
    transactionBatcherContractAddress
  )

  // Keep track of batches in the mempool.
  let pendingBatches = []

  // Calls to this function will be debounced into one call with all of the used arguments concatenated into an array.
  const batchedSend = functionBatch(async transactions => {
    // Keep track of the index of the new batch, if any, so we can reference it in the confirmation handler below.
    const batchIndex =
      transactions.length > 0
        ? pendingBatches.push(transactions) - 1
        : pendingBatches.length

    // Remove all transactions that would now fail, from pending batches.
    await Promise.all(
      pendingBatches.map(p =>
        Promise.all(
          p.map(t =>
            t
              .method(...(t.args ? t.args : []))
              .estimateGas({ value: t.value || 0 })
              .then(
                gas => ({ ...t, args: t.args || [], gas, value: t.value || 0 }),
                _ => undefined
              )
          )
        ).then(p => p.filter(t => t))
      )
    ).then(_pendingBatches => (pendingBatches = _pendingBatches))

    const currentGasPrice = web3.utils.toBN(await web3.eth.getGasPrice());
    const maxGasPrice = !!process.env.GAS_PRICE_CEILING_WEI
      ? web3.utils.toBN(process.env.GAS_PRICE_CEILING_WEI)
      : currentGasPrice;
    const maxPriorityFeePerGas = web3.utils.toBN(web3.utils.toWei("1", "gwei"));
    const maxFeePerGas = currentGasPrice.gt(maxGasPrice)
      ? maxGasPrice.add(maxPriorityFeePerGas).toString()
      : currentGasPrice.add(maxPriorityFeePerGas).toString();

    // Build data for the batch transaction using all the transactions in the new batch and all the transactions in previous pending batches.
    // We do this because if we have pending batches by the time a new batch arrives, it means that their gas prices were too low, so sending a new batch transaction with the same nonce
    // that includes the contents of the new batch and previous pending batches remediates this. If for some reason, the latest batch transaction is not the one that finally gets mined,
    // we can just slice off the leading part of `pendingBatches` up to the batch whose transaction got mined and send a new batch transaction with all the transactions in the batches that remain.
    const batch = [].concat(...pendingBatches).reduce(
      (acc, t) => {
        // Don't exceed block gas limit.
        if (acc.totalGas + t.gas < 3000000) {
          acc.datas.push(t.method(...t.args).encodeABI())
          acc.targets.push(t.to)
          acc.totalGas += t.gas
          acc.totalValue += t.value
          acc.values.push(t.value)
        }
        return acc
      },
      { datas: [], targets: [], totalGas: 0, totalValue: 0, values: [] }
    )

    // Send it if it has at least one item.
    if (batch.targets.length > 0) {
      const batchSend = transactionBatcher.methods.batchSend(
        batch.targets,
        batch.values,
        batch.datas
      );
      web3.eth
        .sendSignedTransaction(
          (
            await web3.eth.accounts.signTransaction(
              {
                data: batchSend.encodeABI(),
                gas:
                  (await batchSend.estimateGas({ value: batch.totalValue })) +
                  batch.totalGas,
                to: transactionBatcher.options.address,
                value: batch.totalValue,
                maxFeePerGas,
                maxPriorityFeePerGas,
              },
              privateKey
            )
          ).rawTransaction
        )
        .on('receipt', receipt => {
          console.info('Batch receipt: ', receipt)
          // Remove all batches whose transactions were mined by using the `batchIndex` we have a closure over.
          pendingBatches = pendingBatches.slice(batchIndex + 1)
          if (pendingBatches.length > 0) batchedSend([]) // If some batches remain, send a new batch transaction with all of their transactions.
        })
        .on('error', err => {
          console.error('Batch error: ', err)
          // We ignore errors, because lost transactions will just get sent in a future batch.
        })
    }
  }, wait)
  return batchedSend
}
