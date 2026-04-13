const delay = require("delay");
const https = require("https");
const _klerosLiquid = require("../contracts/kleros-liquid.json");

const DELAYED_STAKES_ITERATIONS = 15;

module.exports = async (web3, batchedSend) => {
  // Instantiate the Kleros Liquid contract.
  const klerosLiquid = new web3.eth.Contract(
    _klerosLiquid.abi,
    process.env.KLEROS_LIQUID_CONTRACT_ADDRESS
  );
  const PhaseEnum = Object.freeze({ staking: 0, generating: 1, drawing: 2 });

  // Keep track of executed disputes so we don't waste resources on them.
  const executedDisputeIDs = {};

  while (true) {
    let doHeartbeat = true;
    console.log("Initializing klerosLiquid loop...");
    // Try to execute delayed set stakes if there are any. We check because this transaction still succeeds when there are not any and we don't want to waste gas in those cases.
    if (
      (await klerosLiquid.methods.lastDelayedSetStake().call()) >=
      (await klerosLiquid.methods.nextDelayedSetStake().call())
    ) {
      console.log("Executing delayed set stakes...");
      await batchedSend({
        args: [DELAYED_STAKES_ITERATIONS],
        method: klerosLiquid.methods.executeDelayedSetStakes,
        to: klerosLiquid.options.address,
      });
    }
    // Loop over all disputes.
    try {
      let disputeID = process.env.STARTING_DISPUTE_ID || 0;
      while (true) {
        console.debug(`Processing dispute ${disputeID}`);
        if (!executedDisputeIDs[disputeID]) {
          let dispute;
          try {
            dispute = await klerosLiquid.methods.disputes(disputeID).call();
          } catch (e) {
            // We are in a disputeID that doesn't exist.
            // console.error(
            //   `Error trying to read dispute ${disputeID}: ${e.message}`
            // );
            break;
          }
          const dispute2 = await klerosLiquid.methods
            .getDispute(disputeID)
            .call();
          const voteCounters = await Promise.all(
            // eslint-disable-next-line no-loop-func
            dispute2.votesLengths.map(async (numberOfVotes, i) => {
              let voteCounter;
              try {
                voteCounter = await klerosLiquid.methods
                  .getVoteCounter(disputeID, i)
                  .call();
              } catch (_) {
                // Look it up manually if numberOfChoices is too high for loop
                console.debug(
                  `Looking up vote counter manually for dispute ${disputeID}, choice ${i}`
                );
                let tied = true;
                let winningChoice = "0";
                const _voteCounters = {};

                for (let j = 0; j < numberOfVotes; j++) {
                  const vote = await klerosLiquid.methods.getVote(
                    disputeID,
                    i,
                    j
                  );
                  if (vote.voted) {
                    // increment vote count
                    _voteCounters[vote.choice] = _voteCounters[vote.choice]
                      ? _voteCounters[vote.choice] + 1
                      : 1;
                    if (vote.choice === winningChoice) {
                      if (tied) tied = false; // broke tie
                    } else {
                      const _winningChoiceVotes =
                        _voteCounters[winningChoice] || 0;
                      if (_voteCounters[vote.choice] > _winningChoiceVotes) {
                        winningChoice = vote.choice;
                        tied = false;
                      } else if (
                        _voteCounters[vote.choice] === _winningChoiceVotes
                      )
                        tied = true;
                    }
                  }
                }

                voteCounter = {
                  tied,
                  winningChoice,
                };
              }

              return voteCounter;
            })
          );
          console.debug(`Vote counter has ${voteCounters.length} entries`);

          const notTieAndNoOneCoherent = voteCounters.map(
            (v) =>
              !voteCounters[voteCounters.length - 1].tied &&
              v.counts[voteCounters[voteCounters.length - 1].winningChoice] ===
                "0"
          );
          console.debug(
            `No tie and no coherent votes for dispute ${disputeID}: ${notTieAndNoOneCoherent}`
          );
          if (
            !dispute.ruled ||
            dispute2.votesLengths.some(
              (l, i) =>
                Number(notTieAndNoOneCoherent[i] ? l : l * 2) !==
                Number(dispute2.repartitionsInEachRound[i])
            )
          ) {
            // The dispute is not finalized, try to call all of its callbacks.
            console.log("Calling callbacks for dispute %s", disputeID);
            await batchedSend(
              [
                // We check if there are still pending draws because if there aren't any and the dispute is still in the evidence period,
                // then the transaction would still succeed and we don't want to waste gas in those cases.
                dispute2.votesLengths[dispute2.votesLengths.length - 1] >
                  dispute.drawsInRound && {
                  args: [disputeID, 15],
                  method: klerosLiquid.methods.drawJurors,
                  to: klerosLiquid.options.address,
                },
                ...dispute2.votesLengths.map(
                  // eslint-disable-next-line no-loop-func
                  (l, i) =>
                    Number(notTieAndNoOneCoherent[i] ? l : l * 2) !==
                      Number(dispute2.repartitionsInEachRound[i]) && {
                      args: [disputeID, i, 15],
                      method: klerosLiquid.methods.execute,
                      to: klerosLiquid.options.address,
                    }
                ),
                {
                  args: [disputeID],
                  method: klerosLiquid.methods.executeRuling,
                  to: klerosLiquid.options.address,
                },
                {
                  args: [disputeID],
                  method: klerosLiquid.methods.passPeriod,
                  to: klerosLiquid.options.address,
                },
              ].filter((t) => t)
            );
          } else {
            executedDisputeIDs[disputeID] = true; // The dispute is finalized, cache it.
            console.log("Dispute %s is finalized, caching it.", disputeID);
          }
        } else {
          console.debug(`Dispute ${disputeID} is already executed.`);
        }
        disputeID++;
      }
    } catch (e) {
      console.error("Failed to process disputes: ", e);
      doHeartbeat = false;
    } // Reached the end of the disputes list.

    // Try to pass the phase.
    let readyForNextPhase = false;
    const phase = await klerosLiquid.methods.phase().call();
    const lastPhaseChange = await klerosLiquid.methods.lastPhaseChange().call();
    const disputesWithoutJurors = await klerosLiquid.methods
      .disputesWithoutJurors()
      .call();
    console.log(`Checking if reay to move phase`);
    if (phase == PhaseEnum.staking) {
      const minStakingTime = await klerosLiquid.methods.minStakingTime().call();
      if (
        Date.now() - lastPhaseChange * 1000 >= minStakingTime * 1000 &&
        disputesWithoutJurors > 0
      ) {
        console.debug(`Ready to move from staking to generating`);
        readyForNextPhase = true;
      }
    } else if (phase == PhaseEnum.generating) {
      console.debug(`Ready to move from generating to drawing`);
      readyForNextPhase = true;
    } else if (phase == PhaseEnum.drawing) {
      const maxDrawingTime = await klerosLiquid.methods.maxDrawingTime().call();
      if (
        Date.now() - lastPhaseChange * 1000 >= maxDrawingTime * 1000 ||
        disputesWithoutJurors == 0
      ) {
        console.debug(`Ready to move from drawing to staking`);
        readyForNextPhase = true;
      }
    }

    if (readyForNextPhase) {
      console.log("Passing phase...");
      await batchedSend({
        method: klerosLiquid.methods.passPhase,
        to: klerosLiquid.options.address,
      });
    }

    if (process.env.HEARTBEAT_URL && doHeartbeat) {
      console.log("Sending heartbeat...");
      https
        .get(process.env.HEARTBEAT_URL, () => {})
        .on("error", (e) => {
          console.error("Failed to send heartbeat: %s", e);
        });
    }
    console.log("Waiting for 10 minutes for next loop...");
    await delay(1000 * 60 * 10); // Every 10 minutes
  }
};
