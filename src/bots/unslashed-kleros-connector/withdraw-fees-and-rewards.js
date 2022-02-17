const delay = require('delay')

const Ruling = {
  None: 0,
  Claimant: 1,
  Challenger: 2
}
const klerosConnectorData = JSON.parse(process.env.UNSLASHED_KLEROS_CONNECTOR)
const deploymentBlock = klerosConnectorData.blockNumber

module.exports = async (web3, batchedSend, klerosConnector) => {
  // Keep track of the disputes so that we don't waste unnecessary resources on them.
  const withdrawnDisputeIDs = {}
  const queryFrequency = 60 // minutes

  while (true) {
    const transactionList = []

    // Loop over all disputes.
    try {
      let localDisputeID = 0
      while (true) {
        if (withdrawnDisputeIDs[localDisputeID]) {
          // Fees already withdrawn.
          localDisputeID++
          continue
        }

        const disputeData = await klerosConnector.methods.disputes(localDisputeID).call()
        if (!disputeData.resolved) {
          // Dispute is not resolved yet.
          localDisputeID++
          continue
        }

        // Get contribution events.
        const contributionEvents = await klerosConnector.getPastEvents(
          'Contribution',
          {
            fromBlock: deploymentBlock,
            filter: {
              localDisputeID: web3.utils.toBN(localDisputeID)
            }
          }
        )

        const numberOfRounds = await klerosConnector.methods
          .getNumberOfRounds(localDisputeID)
          .call()
        const disputeWithdrawals = []
        for (let i = 0; i < contributionEvents.length; i++) {
          const contribution = contributionEvents[i].returnValues
          if (contribution.round == 0) continue // Round zero is automatically withdrawn by the contract logic.

          if (
            disputeData.ruling == Ruling.None || 
            contribution.ruling == disputeData.ruling ||
            contribution.round == numberOfRounds - 1
          ) {
            const contributionData = await klerosConnector.methods
              .getContributions(
                localDisputeID,
                contribution.round,
                contribution.contributor
              )
              .call()

            // First check if it was already withdrawn.
            if (contributionData[contribution.ruling] > 0) {
              disputeWithdrawals.push({
                args: [
                  localDisputeID,
                  contribution.contributor,
                  contribution.round,
                  contribution.ruling
                ],
                method: klerosConnector.methods.withdrawFeesAndRewards,
                to: klerosConnector.options.address
              })
            }
          }
        }
        if (disputeWithdrawals.length == 0) {
          withdrawnDisputeIDs[localDisputeID] = true
        } else {
          transactionList.push(...disputeWithdrawals)
        }

        localDisputeID++
      }
    } catch (_) {} // Reached the end of the disputes list.

    if (transactionList.length > 0) {
      batchedSend(transactionList)
    }
    await delay(queryFrequency * 60 * 1000)
  }
}
