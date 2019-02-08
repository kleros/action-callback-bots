const delay = require('delay')
const _multipleArbitrableTransaction = require('../contracts/multiple-arbitrable-transaction.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the multiple arbitrable transaction contract.
  const multipleArbitrableTransaction = new web3.eth.Contract(
    _multipleArbitrableTransaction.abi,
    process.env.MULTIPLE_ARBITRABLE_TRANSACTION_CONTRACT_ADDRESS
  )

  // Keep track of resolved transactions so we don't waste resources on them.
  const resolvedTransactionIDs = {}

  // Run every 5 minutes.
  while (true) {
    // Loop over all transactions.
    try {
      let transactionID = 0
      while (true) {
        if (!resolvedTransactionIDs[transactionID])
          if (
            (await multipleArbitrableTransaction.methods
              .transactions(transactionID)
              .call()).status !== '4'
          )
            // The transaction is not finalized, try to call all of its callbacks.
            batchedSend([
              {
                args: [transactionID],
                method:
                  multipleArbitrableTransaction.methods.executeTransaction,
                to: multipleArbitrableTransaction.options.address
              },
              {
                args: [transactionID],
                method: multipleArbitrableTransaction.methods.timeOutByReceiver,
                to: multipleArbitrableTransaction.options.address
              },
              {
                args: [transactionID],
                method: multipleArbitrableTransaction.methods.timeOutBySender,
                to: multipleArbitrableTransaction.options.address
              }
            ])
          else resolvedTransactionIDs[transactionID] = true
        transactionID++
      }
    } catch (_) {} // Reached the end of the transactions list.

    await delay(300000)
  }
}
