/* This bot only triggers the AMB execution of calls from home chain to foreign chain.
 * These transactions were previously subsidized by the bridge itself and are for now
 * subsidized through these bots. If you'd like to stop subsidizing the AMB calls, 
 * just turn off this bot. For the entire cross-chain communication logic, check
 * the bots here https://github.com/kleros/cross-chain-realitio-proxy/tree/master/bots.
*/ 

const delay = require('delay')
const RealitioHomeArbitrationProxy = require('../../contracts/realitio-home-arbitration-proxy.json')
const HomeAMB = require('../../contracts/xdai-home-amb.json')
const AMBBridgeHelper = require('../../contracts/xdai-home-bridge-helper.json')
const ForeignAMB = require('../../contracts/xdai-foreign-amb.json')

const realitioHomeArbitrationProxyData = JSON.parse(process.env.REALITIO_HOME_ARBITRAITON_PROXY)

module.exports = async (web3, homeWeb3, batchedSend) => {

  const realitioHomeArbitrationProxy = new homeWeb3.eth.Contract(
    RealitioHomeArbitrationProxy.abi,
    realitioHomeArbitrationProxyData.address
  )
  const homeAmb = new homeWeb3.eth.Contract(
    HomeAMB.abi,
    process.env.HOME_AMB_CONTRACT_ADDRESS
  )
  const ambBridgeHelper = new homeWeb3.eth.Contract(
    AMBBridgeHelper.abi,
    process.env.HOME_AMB_BRIDGE_HELPER_CONTRACT_ADDRESS
  )
  const foreignAmb = new web3.eth.Contract(
    ForeignAMB.abi,
    process.env.FOREIGN_AMB_CONTRACT_ADDRESS
  )

  // Keep track of the messages so that we don't waste unnecessary resources on them.
  const pendingMessages = []
  const queryFrequency = 5 // minutes
  const signaturesProcessed = web3.utils.toBN("0x8000000000000000000000000000000000000000000000000000000000000000")
  let fromBlock = realitioHomeArbitrationProxyData.blockNumber

  while (true) {
    const transactionList = []

    try {
      // Look for new messages to relay.
      const requestAcknowledgedEvents = await realitioHomeArbitrationProxy.getPastEvents(
        "RequestAcknowledged",
        {
          fromBlock: fromBlock
        }
      )
      const requestCanceledEvents = await realitioHomeArbitrationProxy.getPastEvents(
        "RequestCanceled",
        {
          fromBlock: fromBlock
        }
      )
      const events = [
        ...requestAcknowledgedEvents,
        ...requestCanceledEvents
      ]

      for (let index = 0; index < events.length; index++) {
        const event = events[index]
        // In order to relay the messages to the foreign chain, the home txs info should be collected first.
        const receipt = await homeWeb3.eth.getTransactionReceipt(event.transactionHash)
        const userRequestForSignature = receipt.logs.filter(log => log.logIndex == event.logIndex - 1)[0]
        const encodedData = web3.eth.abi.decodeParameters(["bytes"], userRequestForSignature.data)[0];
        const messageId = userRequestForSignature.topics[1]
        const hashMsg = web3.utils.keccak256(encodedData)

        pendingMessages.push({
          messageId: messageId,
          encodedData: encodedData,
          hashMsg: hashMsg,
          signatures: null
        })

        if (index == events.length - 1) {
          fromBlock = event.blockNumber + 1
        }
      }

      // Looping backwards to remove messages from the pending list dynamically.
      for (let index = pendingMessages.length - 1; index >= 0; index--) {
        const message = pendingMessages[index];

        const wasRelayed = await foreignAmb.methods
          .relayedMessages(message.messageId)
          .call()
        if (wasRelayed) {
          // Remove from pending list.
          pendingMessages.splice(index, 1)
          continue
        }

        if (!message.signatures) {
          // Check if the signatures are ready.
          const signaturesCount = await homeAmb.methods
            .numMessagesSigned(message.hashMsg)
            .call()
          
          if (web3.utils.toBN(signaturesCount).lt(signaturesProcessed)) continue

          // Retrieve the signatures on the home chain.
          const signatures = await ambBridgeHelper.methods
            .getSignatures(message.encodedData)
            .call()

          message.signatures = signatures
        } 
        
        // Execute the call on the foreign chain.
        transactionList.push({
          args: [
            message.encodedData,
            message.signatures
          ],
          method: foreignAmb.methods.safeExecuteSignaturesWithAutoGasLimit,
          to: foreignAmb.options.address
        })
        
      }
    } catch (error) {} // Reached the end of the disputes list.

    if (transactionList.length > 0) {
      batchedSend(transactionList)
    }
    await delay(queryFrequency * 60 * 1000)
  }
}
  