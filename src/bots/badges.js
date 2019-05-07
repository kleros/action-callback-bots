const delay = require('delay')
const _badgeContract = require('../contracts/arbitrable-address-list.json')
const TCRs = require('../../assets/TCRs.json')

const { executePending } = require('../utils/tcr')

module.exports = async (web3, batchedSend) => {
  // Instantiate the badge contracts.
  const badgeContracts = TCRs[process.env.NETWORK].BadgeTCRs.map(
    badgeContract => ({
      blockNumber: badgeContract.blockNumber,
      tcrContract: new web3.eth.Contract(
        _badgeContract.abi,
        badgeContract.address
      )
    })
  )

  while (true) {
    await Promise.all(
      badgeContracts.map(async badgeContract => {
        const executedItems = await executePending({
          batchedSend,
          fromBlock: badgeContract.blockNumber,
          tcrContract: badgeContract.tcrContract,
          toBN: web3.utils.toBN,
          type: 'Address'
        })

        executedItems.forEach(item => {
          console.info(`Executed ${item}`)
        })
      })
    )

    await delay(1000 * 60 * 60 * 10) // Every 10 minutes
  }
}
