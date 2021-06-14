const { gql } = require('graphql-request')

// processVouches(address _submissionID, uint _requestID, uint _iterations)
// Conditions:
// - The request must be resolved.
// - The penalty index can't exceed the number of vouches.
module.exports = async (graph, proofOfHumanity) => {
  const { submissions: allSubmissions } = await graph.request(
    gql`
      query processVouchesQuery {
        submissions(first: 100, where: { vouchReleaseReady: true }) {
          vouchees (first: 10, where: { submissionTime_not: 0 } ) {
            id
            requestsLength
          }
        }
      }
    `
  )

  const toProcess = allSubmissions.flatMap(s => s.vouchees).map(({ id, requestsLength }) => ({
    args: [id, requestsLength - 1, 15],
    method: proofOfHumanity.methods.processVouches,
    to: proofOfHumanity.options.address,
  }))

  return toProcess
}
