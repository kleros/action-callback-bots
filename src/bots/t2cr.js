const delay = require('delay')
const TCRs = require('../../assets/TCRs.json')
const _T2CR = require('../contracts/t2cr.json')

const { executePending } = require('../utils/tcr')

module.exports = async (web3, batchedSend) => {
  // Instantiate the T2CR contract.
  const T2CR = new web3.eth.Contract(
    _T2CR.abi,
    TCRs[process.env.NETWORK].T2CR.address
  )

  while (true) {
    const executedItems = await executePending({
      batchedSend,
      fromBlock: TCRs[process.env.NETWORK].T2CR.blockNumber,
      tcrContract: T2CR,
      type: 'Token'
    })

    executedItems.forEach(item => {
      console.info(`Executed ${item}`)
    })

    await delay(1000 * 60 * 60 * 10) // Every 10 minutes
  }
}
