const { gql } = require('graphql-request')

// processVouches(address _submissionID, uint _requestID, uint _iterations)
// Conditions:
// - The request must be resolved.
// - The penalty index can't exceed the number of vouches.
module.exports = async (graph, proofOfHumanity) => {
  const { submissions } = await graph.request(
    gql`
      query processVouchesQuery {
        # require(request.resolved, "Submission should be resolved");
        submissions(where: { status: "None" }) {
          id
          requests(orderBy: creationTime) {
            resolved
            vouches {
              id
            }
            penaltyIndex
          }
        }
      }
    `
  )

  return submissions.flatMap(({ id, requests }) =>
    requests
      // The request must be resolved.
      // The penalty index can't exceed the number of vouches.
      .map(
        (request, index) =>
          request.resolved &&
          request.penaltyIndex < request.vouches.length && {
            args: [id, index, -1],
            method: proofOfHumanity.methods.processVouches,
            to: proofOfHumanity.options.address
          }
      )
      .filter(Boolean)
  )
}
