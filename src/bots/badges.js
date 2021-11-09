const delay = require('delay')
const _badgeContract = require('../contracts/arbitrable-address-list.json')

const { executePending } = require('../utils/tcr')

module.exports = async (web3, batchedSend) => {
  // Instantiate the badge contracts.
  const badgeTCRs = JSON.parse(process.env.BADGE_TCRS)

  const badgeContracts = badgeTCRs.map(badgeContract => ({
    latestBlockNumber: badgeContract.blockNumber,
    tcrContract: new web3.eth.Contract(
      _badgeContract.abi,
      badgeContract.address
    )
  }))

  while (true) {
    await Promise.all(
      badgeContracts.map(async badgeContract => {
        badgeContract.latestBlockNumber = await executePending({
          batchedSend,
          fromBlock: badgeContract.latestBlockNumber,
          tcrContract: badgeContract.tcrContract,
          toBN: web3.utils.toBN,
          type: 'Address'
        })
      })
    )

    await delay(1000 * 60 * 60) // Every 60 minutes
  }
}
