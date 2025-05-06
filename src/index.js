const Web3 = require('web3')
const delay = require('delay')
const _batchedSend = require('./utils/batched-send')

const bots = [
  process.env.KLEROS_LIQUID_CONTRACT_ADDRESS && require('./bots/kleros-liquid'),
  process.env.PROOF_OF_HUMANITY_CONTRACT_ADDRESS &&
    process.env.PROOF_OF_HUMANITY_SUBGRAPH_URL &&
    require('./bots/proof-of-humanity'),
  process.env.T2CR && require('./bots/t2cr'),
  process.env.BADGE_TCRS && require('./bots/badges'),
  process.env.UNSLASHED_KLEROS_CONNECTOR && require('./bots/unslashed-kleros-connector'),
  process.env.HOME_AMB_CONTRACT_ADDRESS &&
    process.env.HOME_AMB_BRIDGE_HELPER_CONTRACT_ADDRESS &&
    process.env.FOREIGN_AMB_CONTRACT_ADDRESS &&
    process.env.REALITIO_HOME_ARBITRAITON_PROXY &&
    require('./bots/cross-chain')
]
  .filter(bot => typeof bot === 'function')

const xDaiBots = [
  process.env.XDAI_ENABLED === 'true' &&
    process.env.XDAI_X_KLEROS_LIQUID_CONTRACT_ADDRESS &&
    require('./xdai-bots/x-kleros-liquid')
]
  .filter(bot => typeof bot === 'function')

// Run bots and restart them on failures.
const run = async (bot, { providerUrl, batcherAddress, privateKey }) => {
  // Create an instance of `web3` and `batched-send` for each bot.
  const web3 = new Web3(providerUrl)
  const batchedSend = _batchedSend(
    web3,
    batcherAddress,
    privateKey,
    20000 // Batch time window of 20 seconds.
  )

  while (true) {
    try {
      await bot(web3, batchedSend)
    } catch (err) {
      console.error('Bot error: ', err)
    }
    await delay(60000); // Wait 60 seconds before restarting failed bot.
  }
}

bots.forEach(bot => run(bot, {
  providerUrl: process.env.WEB3_PROVIDER_URL,
  batcherAddress: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS,
  privateKey: process.env.BATCH_SEND_PRIVATE_KEY,
}))

xDaiBots.forEach(bot => run(bot, {
  providerUrl: process.env.XDAI_WEB3_PROVIDER_URL,
  batcherAddress: process.env.XDAI_TRANSACTION_BATCHER_CONTRACT_ADDRESS,
  privateKey: process.env.XDAI_BATCH_SEND_PRIVATE_KEY
}))
