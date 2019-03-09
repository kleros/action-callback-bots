const delay = require('delay')
const _ethfBadge = require('../contracts/arbitrable-address-list.json')

module.exports = async (web3, batchedSend) => {
  // Instantiate the Arbitrable Address List contract.
  const ethfBadge = new web3.eth.Contract(
    _ethfBadge.abi,
    process.env.ETHFINEX_BADGE_CONTRACT_ADDRESS
  )

  while (true) {
    const numSubmissions = await ethfBadge.methods.addressCount().call()
    const challengePeriodDuration = await ethfBadge.methods.challengePeriodDuration().call()

    // Loop over all badge submissions and timeout undisputed pending requests.
    for (let i = 0; i < numSubmissions; i++) {
      const addr = await ethfBadge.methods.addressList(i).call()
      const address = await ethfBadge.methods.getAddressInfo(addr).call()
      if (Number(address.status) <= 1) continue // Badge doesn't have any pending requests.

      const latestRequest = await ethfBadge.methods.getRequestInfo(
        addr,
        Number(address.numberOfRequests) - 1
      ).call()

      if (Number(latestRequest.numberOfRounds) > 1) continue // Badge is disputed.
      if (
        Date.now() - (Number(latestRequest.submissionTime) * 1000) <
        challengePeriodDuration * 1000
      ) continue; // Challenge period has not passed yet.

      try {
        console.info(`Executing ${addr} address.`)
        batchedSend({
          args: [addr],
          method: ethfBadge.methods.executeRequest,
          to: ethfBadge.options.address
        })
      } catch (err) { console.error(err) }
    }

    await delay(1000 * 60 * 60 * 10)  // Every 10 minutes
  }

}
