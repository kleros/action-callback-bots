const { gql } = require('graphql-request')

// processVouches(address _submissionID, uint _requestID, uint _iterations)
// Conditions:
// - The request must be resolved.
// - The penalty index can't exceed the number of vouches.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { requiredNumberOfVouches }
  } = await graph.request(
    gql`
      query contractVariablesQuery {
        contract(id: 0) {
          requiredNumberOfVouches
        }
      }
    `
  )
  // AUTO_PROCESSED_VOUCH vouches are already processed when the request gets executed.
  const AUTO_PROCESSED_VOUCH = 10
  if (requiredNumberOfVouches <= AUTO_PROCESSED_VOUCH) return []

  let lastSubmisionID = "";
  let allSubmissions = [];
  while (true) {
    const { submissions } = await graph.request(
      gql`
        query processVouchesQuery($lastId: String) {
          # require(request.resolved, "Submission should be resolved");
          # Use id_gt instead of skip for better performance.
          submissions(where: { status: "None", id_gt: $lastId }, first: 1000) {
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
      `,
      {
        lastId: lastSubmisionID,
      }
    )
    allSubmissions = allSubmissions.concat(submissions)
    if (submissions.length < 1000) break
    lastSubmisionID = submissions[submissions.length-1].id
  }

  return allSubmissions.flatMap(({ id, requests }) =>
    requests
      // The request must be resolved.
      // The penalty index can't exceed the number of vouches.
      .map(
        (request, index) =>
          request.resolved &&
          request.penaltyIndex < request.vouches.length && {
            args: [id, index, 15],
            method: proofOfHumanity.methods.processVouches,
            to: proofOfHumanity.options.address,
          }
      )
      .filter(Boolean)
  )
}
