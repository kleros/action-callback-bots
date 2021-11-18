const { gql } = require('graphql-request')

// processVouches(address _submissionID, uint _requestID, uint _iterations)
// Conditions:
// - The request must be resolved.
// - The penalty index can't exceed the number of vouches.
module.exports = async (graph, proofOfHumanity) => {
  const { requests: allRequests } = await graph.request(
    gql`
      query processVouchesQuery {
        requests(first: 1000, where: { vouchReleaseReady: true }) {
          id
          requestIndex
          submission {
            id
          }
        }
      }
    `
  )

  const toProcess = allRequests.map(({ submission, requestIndex }) => {
    return ({
      args: [submission.id, requestIndex, 15],
      method: proofOfHumanity.methods.processVouches,
      to: proofOfHumanity.options.address,
    })
  })

  return toProcess
}
