const { GraphQLClient } = require('graphql-request')
const delay = require('delay')
const _proofOfHumanity = require('../../contracts/proof-of-humanity.json')
const changeStateToPending = require('./change-state-to-pending')
const executeRequest = require('./execute-request')
const processVouches = require('./process-vouches')
const withdrawFeesAndRewards = require('./withdraw-fees-and-rewards')

module.exports = async (web3, batchedSend) => {
  // Instantiate the Proof Of Humanity contract and the graph client.
  const proofOfHumanity = new web3.eth.Contract(
    _proofOfHumanity.abi,
    process.env.PROOF_OF_HUMANITY_CONTRACT_ADDRESS
  )
  const graph = new GraphQLClient(process.env.PROOF_OF_HUMANITY_SUBGRAPH_URL)

  // Run every 60 minutes.
  while (true) {
    batchedSend(
      (
        await Promise.all(
          [
            changeStateToPending,
            executeRequest,
            processVouches,
            withdrawFeesAndRewards
          ].map(f => f(graph, proofOfHumanity))
        )
      ).flat()
    )
    await delay(60 * 60 * 1000)
  }
}
