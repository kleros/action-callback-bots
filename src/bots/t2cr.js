const delay = require('delay')
const _T2CR = require('../contracts/t2cr.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the T2CR contract.
  const T2CR = new web3.eth.Contract(
    _T2CR.abi,
    process.env.T2CR_CONTRACT_ADDRESS
  )

  while (true) {
    const numSubmissions = await T2CR.methods.tokenCount().call()
    const challengePeriodDuration = await T2CR.methods
      .challengePeriodDuration()
      .call()

    // Loop over all token submissions and timeout undisputed pending requests.
    for (let i = 0; i < Number(numSubmissions.count); i++) {
      const tokenID = await T2CR.methods.tokensList(i).call()
      const token = await T2CR.methods.getTokenInfo(tokenID).call()
      if (Number(token.status) <= 1) continue // Token doesn't have any pending requests.

      const latestRequest = await T2CR.methods
        .getRequestInfo(tokenID, token.numberOfRequests - 1)
        .call()

      if (Number(latestRequest.numberOfRounds) > 1) continue // Token is disputed.
      if (
        Date.now() - latestRequest.submissionTime * 1000 <
        challengePeriodDuration * 1000
      )
        continue // Challenge period has not passed yet.

      console.info(`Executing ${token.ticker} token.`)
      batchedSend({
        args: [tokenID],
        method: T2CR.methods.executeRequest,
        to: T2CR.options.address
      })
    }

    await delay(1000 * 60 * 60 * 10) // Every 10 minutes
  }
}
