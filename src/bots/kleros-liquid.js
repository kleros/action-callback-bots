const delay = require('delay')
const _klerosLiquid = require('../contracts/kleros-liquid.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the Kleros Liquid contract.
  const klerosLiquid = new web3.eth.Contract(
    _klerosLiquid.abi,
    process.env.KLEROS_LIQUID_CONTRACT_ADDRESS
  )

  // Keep track of executed disputes so we don't waste resources on them.
  const executedDisputeIDs = {}

  // Run every 5 minutes.
  while (true) {
    // Try to execute delayed set stakes if there are any. We check because this transaction still succeeds when there are not any and we don't want to waste gas in those cases.
    if (
      (await klerosLiquid.methods.lastDelayedSetStake().call()) >=
      (await klerosLiquid.methods.nextDelayedSetStake().call())
    )
      batchedSend({
        args: [1000],
        method: klerosLiquid.methods.executeDelayedSetStakes,
        to: klerosLiquid.options.address
      })

    // Loop over all disputes.
    try {
      let disputeID = 0
      while (true) {
        if (!executedDisputeIDs[disputeID]) {
          const dispute = await klerosLiquid.methods.disputes(disputeID).call()
          const dispute2 = await klerosLiquid.methods
            .getDispute(disputeID)
            .call()
          if (
            !dispute.ruled ||
            dispute2.votesLengths.some(
              (l, i) => l !== dispute2.repartitionsInEachRound[i]
            )
          )
            // The dispute is not finalized, try to call all of its callbacks.
            batchedSend(
              [
                // We check if there are still pending draws because if there aren't any and the dispute is still in the evidence period,
                // then the transaction would still succeed and we don't want to waste gas in those cases.
                dispute2.votesLengths[dispute2.votesLengths.length - 1] >
                  dispute.drawsInRound && {
                  args: [disputeID, 1000],
                  method: klerosLiquid.methods.drawJurors,
                  to: klerosLiquid.options.address
                },
                {
                  args: [disputeID, 1000],
                  method: klerosLiquid.methods.execute,
                  to: klerosLiquid.options.address
                },
                {
                  args: [disputeID],
                  method: klerosLiquid.methods.executeRuling,
                  to: klerosLiquid.options.address
                },
                {
                  args: [disputeID],
                  method: klerosLiquid.methods.passPeriod,
                  to: klerosLiquid.options.address
                }
              ].filter(t => t)
            )
          else executedDisputeIDs[disputeID] = true // The dispute is finalized, cache it.
        }
        disputeID++
      }
    } catch (_) {} // Reached the end of the disputes list.

    // Try to pass the phase.
    batchedSend({
      method: klerosLiquid.methods.passPhase,
      to: klerosLiquid.options.address
    })
    await delay(300000)
  }
}
