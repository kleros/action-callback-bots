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
        args: [15],
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
          const voteCounters = await Promise.all(
            // eslint-disable-next-line no-loop-func
            dispute2.votesLengths.map(async (numberOfVotes, i) => {
              let voteCounter
              try {
                voteCounter = await klerosLiquid.methods
                  .getVoteCounter(disputeID, i)
                  .call()
              } catch (_) {
                // Look it up manually if numberOfChoices is too high for loop
                let tied = true
                let winningChoice = '0'
                const _voteCounters = {}

                for (let j = 0; j < numberOfVotes; j++) {
                  const vote = await klerosLiquid.methods.getVote(
                    disputeID,
                    i,
                    j
                  )
                  if (vote.voted) {
                    // increment vote count
                    _voteCounters[vote.choice] = _voteCounters[vote.choice]
                      ? _voteCounters[vote.choice] + 1
                      : 1
                    if (vote.choice === winningChoice) {
                      if (tied) tied = false // broke tie
                    } else {
                      const _winningChoiceVotes =
                        _voteCounters[winningChoice] || 0
                      if (_voteCounters[vote.choice] > _winningChoiceVotes) {
                        winningChoice = vote.choice
                        tied = false
                      } else if (
                        _voteCounters[vote.choice] === _winningChoiceVotes
                      )
                        tied = true
                    }
                  }
                }

                voteCounter = {
                  tied,
                  winningChoice
                }
              }

              return voteCounter
            })
          )

          const notTieAndNoOneCoherent = voteCounters.map(
            v =>
              !voteCounters[voteCounters.length - 1].tied &&
              v.counts[voteCounters[voteCounters.length - 1].winningChoice] ===
                '0'
          )
          if (
            !dispute.ruled ||
            dispute2.votesLengths.some(
              (l, i) =>
                Number(notTieAndNoOneCoherent[i] ? l : l * 2) !==
                Number(dispute2.repartitionsInEachRound[i])
            )
          )
            // The dispute is not finalized, try to call all of its callbacks.
            batchedSend(
              [
                // We check if there are still pending draws because if there aren't any and the dispute is still in the evidence period,
                // then the transaction would still succeed and we don't want to waste gas in those cases.
                dispute2.votesLengths[dispute2.votesLengths.length - 1] >
                  dispute.drawsInRound && {
                  args: [disputeID, 15],
                  method: klerosLiquid.methods.drawJurors,
                  to: klerosLiquid.options.address
                },
                ...dispute2.votesLengths.map(
                  // eslint-disable-next-line no-loop-func
                  (l, i) =>
                    Number(notTieAndNoOneCoherent[i] ? l : l * 2) !==
                      Number(dispute2.repartitionsInEachRound[i]) && {
                      args: [disputeID, i, 15],
                      method: klerosLiquid.methods.execute,
                      to: klerosLiquid.options.address
                    }
                ),
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
