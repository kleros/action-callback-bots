const Web3 = require('web3')
const delay = require('delay')
const _batchedSend = require('./utils/batched-send')
const bots = [
  require('./bots/kleros-liquid'),
  require('./bots/t2cr'),
  require('./bots/badges')
]

// Run bots and restart them on failures.
const run = async bot => {
  // Create an instance of `web3` and `batched-send` for each bot.
  const web3 = new Web3(process.env.WEB3_PROVIDER_URL)
  const batchedSend = _batchedSend(
    web3,
    process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS,
    process.env.BATCH_SEND_PRIVATE_KEY,
    20000 // Batch time window of 20 seconds.
  )

  while (true) {
    try {
      await bot(web3, batchedSend)
    } catch (err) {
      console.error('Bot error: ', err)
    }
    await delay(10000) // Wait 10 seconds before restarting failed bot.
  }
}
bots.forEach(run)
