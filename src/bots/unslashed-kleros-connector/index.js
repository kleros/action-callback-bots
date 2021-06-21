const delay = require('delay')
const _klerosConnector = require('../../contracts/kleros-connector.json')
const bots = [
  require('./execute-timeouts'),
  require('./withdraw-fees-and-rewards')
]

module.exports = async (web3, batchedSend) => {
  // Instantiate the Kleros Liquid contract.
  const klerosConnector = new web3.eth.Contract(
      _klerosConnector.abi,
      process.env.UNSLASHED_KLEROS_CONNECTOR_CONTRACT_ADDRESS
  )

  // Run bots and restart them on failures.
  const run = async bot => {
    while (true) {
      try {
        await bot(web3, batchedSend, klerosConnector)
      } catch (err) {
        console.error('Bot error: ', err)
      }
      await delay(10000) // Wait 10 seconds before restarting failed bot.
    }
  }
  bots.forEach(run)
}
