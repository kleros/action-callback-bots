const { gql } = require('graphql-request')

// withdrawFeesAndRewards(address payable _beneficiary, address _submissionID, uint _requestID, uint _challengeID, uint _round)
// Conditions:
// - The request must be resolved.
module.exports = async (graph, proofOfHumanity) => {

  let lastContributionID = "";
  let allContributions = [];
  while (true) {
    const { contributions } = await graph.request(
      gql`
        query withdrawFeesAndRewardsQuery($lastId: String) {
          contributions(where: { values_not: [0, 0], id_gt: $lastId }, first: 1000) {
            contributor
            id
            round {
              id
              challenge {
                request {
                  resolved
                  submission {
                    id
                    requests(orderBy: creationTime) {
                      id
                    }
                  }
                  id
                  challenges(orderBy: creationTime) {
                    id
                  }
                }
                id
                rounds(orderBy: creationTime) {
                  id
                }
              }
            }
          }
        }
      `,
      {
        lastId: lastContributionID,
      }
    )
    allContributions = allContributions.concat(contributions)
    if (contributions.length < 1000) break
    lastContributionID = contributions[contributions.length-1].id
  }
  return (
    allContributions
      // The request must be resolved.
      .filter(contribution => contribution.round.challenge.request.resolved)
      .map(({ contributor, round }) => ({
        args: [
          contributor,
          round.challenge.request.submission.id,
          round.challenge.request.submission.requests.findIndex(
            request => request.id === round.challenge.request.id
          ),
          round.challenge.request.challenges.findIndex(
            challenge => challenge.id === round.challenge.id
          ),
          round.challenge.rounds.findIndex(_round => _round.id === round.id)
        ],
        method: proofOfHumanity.methods.withdrawFeesAndRewards,
        to: proofOfHumanity.options.address
      }))
  )
}
