const Web3 = require('web3')
const delay = require('delay')
const _batchedSend = require('./utils/batched-send')
const bots = [
  process.env.KLEROS_LIQUID_CONTRACT_ADDRESS && require('./bots/kleros-liquid'),
  process.env.PROOF_OF_HUMANITY_CONTRACT_ADDRESS && process.env.PROOF_OF_HUMANITY_SUBGRAPH_URL && require('./bots/proof-of-humanity'),
  process.env.T2CR && require('./bots/t2cr'),
  process.env.BADGE_TCRS && require('./bots/badges'),
  process.env.UNSLASHED_KLEROS_CONNECTOR && require('./bots/unslashed-kleros-connector')
]

// Run bots and restart them on failures.
const run = async bot => {
  if (bot) {
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
}
bots.forEach(run)
