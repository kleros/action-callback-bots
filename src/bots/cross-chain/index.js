const delay = require('delay')
const Web3 = require('web3')

const bots = [
  require('./realitio-xdai-bridge')
]

module.exports = async (web3, batchedSend) => {
  // Instantiate the Unslashed KlerosConnector contract.
  const homeWeb3 = new Web3(process.env.XDAI_WEB3_PROVIDER_URL)

  // Run bots and restart them on failures.
  const run = async bot => {
    while (true) {
      try {
        await bot(web3, homeWeb3, batchedSend)
      } catch (err) {
        console.error('Bot error: ', err)
      }
      await delay(10000) // Wait 10 seconds before restarting failed bot.
    }
  }
  await Promise.race(bots.map(bot => run(bot)))
}
