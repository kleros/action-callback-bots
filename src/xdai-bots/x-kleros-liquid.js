const delay = require('delay')
const _xKlerosLiquid = require('../contracts/x-kleros-liquid.json')
const _randomAuRa = require('../contracts/randon-au-ra.json')

const DELAYED_STAKES_ITERATIONS = 15

module.exports = async (web3, batchedSend) => {
  // Instantiate the Kleros Liquid contract.
  const xKlerosLiquid = new web3.eth.Contract(
    _xKlerosLiquid.abi,
    process.env.XDAI_X_KLEROS_LIQUID_CONTRACT_ADDRESS
  )
  const randomAuRa = new web3.eth.Contract(
    _randomAuRa.abi,
    await xKlerosLiquid.methods.RNGenerator().call()
  )

  const PhaseEnum = Object.freeze({ staking: 0, generating: 1, drawing: 2 })

  // Keep track of executed disputes so we don't waste resources on them.
  const executedDisputeIDs = {}

  // Run every 5 minutes.
  while (true) {
    // Try to execute delayed set stakes if there are any. We check because this transaction still succeeds when there are not any and we don't want to waste gas in those cases.
    if (
      (await xKlerosLiquid.methods.lastDelayedSetStake().call()) >=
      (await xKlerosLiquid.methods.nextDelayedSetStake().call())
    )
      batchedSend({
        args: [DELAYED_STAKES_ITERATIONS],
        method: xKlerosLiquid.methods.executeDelayedSetStakes,
        to: xKlerosLiquid.options.address
      })

    // Loop over all disputes.
    try {
      const totalDisputes = Number(await xKlerosLiquid.methods.totalDisputes().call())

      for(let disputeID = 0; disputeID < totalDisputes; disputeID++) {
        if (!executedDisputeIDs[disputeID]) {
          const dispute = await xKlerosLiquid.methods.disputes(disputeID).call()
          const dispute2 = await xKlerosLiquid.methods
            .getDispute(disputeID)
            .call()
          const voteCounters = await Promise.all(
            // eslint-disable-next-line no-loop-func
            dispute2.votesLengths.map(async (numberOfVotes, i) => {
              let voteCounter
              try {
                voteCounter = await xKlerosLiquid.methods
                  .getVoteCounter(disputeID, i)
                  .call()
              } catch (_) {
                // Look it up manually if numberOfChoices is too high for loop
                let tied = true
                let winningChoice = '0'
                const _voteCounters = {}

                for (let j = 0; j < numberOfVotes; j++) {
                  const vote = await xKlerosLiquid.methods.getVote(
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
          ) {
            // The dispute is not finalized, try to call all of its callbacks.
            batchedSend(
              [
                // We check if there are still pending draws because if there aren't any and the dispute is still in the evidence period,
                // then the transaction would still succeed and we don't want to waste gas in those cases.
                dispute2.votesLengths[dispute2.votesLengths.length - 1] >
                  dispute.drawsInRound && {
                  args: [disputeID, 15],
                  method: xKlerosLiquid.methods.drawJurors,
                  to: xKlerosLiquid.options.address
                },
                ...dispute2.votesLengths.map(
                  // eslint-disable-next-line no-loop-func
                  (l, i) =>
                    Number(notTieAndNoOneCoherent[i] ? l : l * 2) !==
                      Number(dispute2.repartitionsInEachRound[i]) && {
                      args: [disputeID, i, 15],
                      method: xKlerosLiquid.methods.execute,
                      to: xKlerosLiquid.options.address
                    }
                ),
                {
                  args: [disputeID],
                  method: xKlerosLiquid.methods.executeRuling,
                  to: xKlerosLiquid.options.address
                },
                {
                  args: [disputeID],
                  method: xKlerosLiquid.methods.passPeriod,
                  to: xKlerosLiquid.options.address
                }
              ].filter(t => t)
            )
          } else {
            executedDisputeIDs[disputeID] = true
          } // The dispute is finalized, cache it.
        }
      }
    } catch {
      // do nothing...
    }

    // Try to pass the phase.
    let readyForNextPhase = false
    const phase = await xKlerosLiquid.methods.phase().call()
    const lastPhaseChange = await xKlerosLiquid.methods.lastPhaseChange().call()
    const disputesWithoutJurors = await xKlerosLiquid.methods
      .disputesWithoutJurors()
      .call()
    if (phase == PhaseEnum.staking) {
      const minStakingTime = await xKlerosLiquid.methods.minStakingTime().call()
      if (
        Date.now() - lastPhaseChange * 1000 >= minStakingTime * 1000 &&
        disputesWithoutJurors > 0
      ) {
        readyForNextPhase = true
      }
    } else if (phase == PhaseEnum.generating) {
      const isCommitPhase = await randomAuRa.methods.isCommitPhase().call();
      if (isCommitPhase) {
        readyForNextPhase = true
      }
    } else if (phase == PhaseEnum.drawing) {
      const maxDrawingTime = await xKlerosLiquid.methods.maxDrawingTime().call()
      if (
        Date.now() - lastPhaseChange * 1000 >= maxDrawingTime * 1000 &&
        disputesWithoutJurors == 0
      ) {
        readyForNextPhase = true
      }
    }

    if (readyForNextPhase) {
      batchedSend({
        method: xKlerosLiquid.methods.passPhase,
        to: xKlerosLiquid.options.address
      })
    }
    await delay(5 * 60 * 1000)
  }
}
