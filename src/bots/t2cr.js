const delay = require('delay')
const _T2CR = require('../contracts/t2cr.json')

const { executePending } = require('../utils/tcr')

module.exports = async (web3, batchedSend) => {
  // Instantiate the T2CR contract.
  const t2cr = JSON.parse(process.env.T2CR)
  const tcrContract = new web3.eth.Contract(_T2CR.abi, t2cr.address)

  let latestBlockNumber = t2cr.blockNumber
  while (true) {
    latestBlockNumber = await executePending({
      batchedSend,
      fromBlock: latestBlockNumber,
      tcrContract,
      toBN: web3.utils.toBN,
      type: 'Token'
    })

    await delay(1000 * 60 * 60) // Every 60 minutes
  }
}
