// Eventless bot. 
// The logic of this bot does not query events in order to determine when to call acceptClaim and refuseClaim on the KlerosConnector contract.
const delay = require('delay')

const ClaimStatus = {
    "None": 0,
    "Created": 1,
    "Disputed": 2,
    "Readjustable": 3,
    "Resolved": 4
}

module.exports = async (web3, batchedSend, klerosConnector) => {
  // Keep track of the claims so that we don't waste unnecessary resources on them.
  const claims = {}
  const queryFrequency = 30 // minutes

  while (true) {
    const contractState = {
        "nbClaims": await klerosConnector.methods.nbClaims().call(),
        "challengeTimeout": await klerosConnector.methods.challengeTimeout().call(),
        "readjustmentTimeout": await klerosConnector.methods.readjustmentTimeout().call()
    }
    const minQueryInterval = contractState.challengeTimeout < contractState.readjustmentTimeout ? contractState.challengeTimeout : contractState.readjustmentTimeout
    const transacionList = []

    // Loop over all claims.
    try {
        const now = (await web3.eth.getBlock("latest")).timestamp;
        for (let claimID = 0; claimID < contractState.nbClaims; claimID++) {
            if (claims[claimID] !== undefined && (
                claims[claimID].lastStatus == ClaimStatus.Resolved ||
                (claims[claimID].lastStatus == ClaimStatus.Created && now - claims[claimID].lastActionTime < contractState.challengeTimeout) ||
                (claims[claimID].lastStatus == ClaimStatus.Readjustable && now - claims[claimID].lastActionTime < contractState.readjustmentTimeout) ||
                (claims[claimID].lastStatus == ClaimStatus.Disputed && now - claims[claimID].lastQueryTime < minQueryInterval))) {
                // Don't query the claim data if it's not needed.
                continue
            }
            
            const claimData = await klerosConnector.methods.claimsData(claimID).call()
            claims[claimID] = {
                lastStatus: claimData.status,
                lastActionTime: claimData.lastActionTime,
                lastQueryTime: now // This value could be a bit underestimated, but it's ok.
            }

            if (
                claims[claimID].lastStatus == ClaimStatus.Created &&
                now - claims[claimID].lastActionTime >= contractState.challengeTimeout
            ) {
                transacionList.append({
                    args: [claimID],
                    method: klerosConnector.methods.acceptClaim,
                    to: klerosConnector.options.address
                })
            } else if (
                claims[claimID].lastStatus == ClaimStatus.Readjustable && 
                now - claims[claimID].lastActionTime >= contractState.readjustmentTimeout
            ) {
                transacionList.append({
                    args: [claimID],
                    method: klerosConnector.methods.refuseClaim,
                    to: klerosConnector.options.address
                })
            }
        }
    } catch (_) {}

    if (transacionList.length > 0) {
        batchedSend(transacionList)
    }
    await delay(queryFrequency * 60 * 1000)
  }
}