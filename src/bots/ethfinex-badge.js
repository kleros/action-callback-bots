const delay = require('delay')
const _ethfinexBadge = require('../contracts/arbitrable-address-list.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the Arbitrable Address List contract.
  const ethfinexBadge = new web3.eth.Contract(
    _ethfinexBadge.abi,
    process.env.ETHFINEX_BADGE_CONTRACT_ADDRESS
  )

  while (true) {
    const numSubmissions = await ethfinexBadge.methods.addressCount().call()
    const challengePeriodDuration = await ethfinexBadge.methods
      .challengePeriodDuration()
      .call()

    // Loop over all badge submissions and timeout undisputed pending requests.
    for (let i = 0; i < Number(numSubmissions.count); i++) {
      const addr = await ethfinexBadge.methods.addressList(i).call()
      const address = await ethfinexBadge.methods.getAddressInfo(addr).call()

      if (Number(address.status) <= 1) continue // Badge doesn't have any pending requests.

      const latestRequest = await ethfinexBadge.methods
        .getRequestInfo(addr, address.numberOfRequests - 1)
        .call()

      if (Number(latestRequest.numberOfRounds) > 1) continue // Badge is disputed.
      if (
        Date.now() - latestRequest.submissionTime * 1000 <
        challengePeriodDuration * 1000
      )
        continue // Challenge period has not passed yet.

      console.info(`Executing ${addr} address.`)
      batchedSend({
        args: [addr],
        method: ethfinexBadge.methods.executeRequest,
        to: ethfinexBadge.options.address
      })
    }

    await delay(1000 * 60 * 60 * 10) // Every 10 minutes
  }
}
