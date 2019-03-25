const delay = require('delay')
const _t2cr = require('../contracts/arbitrable-token-list.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the Arbitrable Token List contract.
  const t2cr = new web3.eth.Contract(
    _t2cr.abi,
    process.env.T2CR_CONTRACT_ADDRESS
  )

  while (true) {
    const numSubmissions = await t2cr.methods.tokenCount().call()
    const challengePeriodDuration = await t2cr.methods.challengePeriodDuration().call()

    // Loop over all token submissions and timeout undisputed pending requests.
    for (let i = 0; i < Number(numSubmissions.count); i++) {
      const tokenID = await t2cr.methods.tokensList(i).call()
      const token = await t2cr.methods.getTokenInfo(tokenID).call()
      if (Number(token.status) <= 1) continue // Token doesn't have any pending requests.

      const latestRequest = await t2cr.methods.getRequestInfo(
        tokenID,
        Number(token.numberOfRequests) - 1
      ).call()

      if (Number(latestRequest.numberOfRounds) > 1) continue // Token is disputed.
      if (
        Date.now() - (Number(latestRequest.submissionTime) * 1000) <
        challengePeriodDuration * 1000
      ) continue; // Challenge period has not passed yet.

      try {
        console.info(`Executing ${token.ticker} token.`)
        batchedSend({
          args: [tokenID],
          method: t2cr.methods.executeRequest,
          to: t2cr.options.address
        })
      } catch (err) { console.error(err) }
    }

    await delay(1000 * 60 * 60 * 10)  // Every 10 minutes
  }

}
