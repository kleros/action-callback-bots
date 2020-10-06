const { gql } = require('graphql-request')

// changeStateToPending(address _submissionID, address[] calldata _vouches)
// Conditions:
// - The submission must have the vouching status.
// - The requester must have paid their fees.
// - The required number of vouches are required.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { requiredNumberOfVouches },
    submissions
  } = await graph.request(
    gql`
      query changeStateToPendingQuery {
        contract(id: 0) {
          requiredNumberOfVouches
        }
        # The submission must have the vouching status.
        submissions(where: { status: "Vouching" }) {
          id
          requests(orderBy: creationTime, orderDirection: desc, first: 1) {
            challenges(orderBy: creationTime, orderDirection: desc, first: 1) {
              rounds(orderBy: creationTime, orderDirection: desc, first: 1) {
                hasPaid
              }
            }
          }
        }
      }
    `
  )

  const submissionsWithVouches = await Promise.all(
    submissions
      // The requester must have paid their fees.
      .filter(
        submission => submission.requests[0].challenges[0].rounds[0].hasPaid[0]
      )
      .map(async submission => ({
        ...submission,
        vouches: (
          await graph.request(
            gql`
              query vouchesQuery($id: [ID!]!) {
                submissions(
                  where: { vouchees_contains: $id, usedVouch: null }
                ) {
                  id
                }
              }
            `,
            {
              id: [submission.id]
            }
          )
        ).submissions.map(submission => submission.id)
      }))
  )

  return (
    submissionsWithVouches
      // The required number of vouches are required.
      .filter(
        submission =>
          submission.vouches.length >= Number(requiredNumberOfVouches)
      )
      .map(submission => ({
        args: [submission.id, submission.vouches],
        method: proofOfHumanity.methods.changeStateToPending,
        to: proofOfHumanity.options.address
      }))
  )
}
