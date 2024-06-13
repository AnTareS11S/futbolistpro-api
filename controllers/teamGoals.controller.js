import Team from '../models/team.model.js';
import TeamGoalsLost from '../models/teamGoalsLost.model.js';
import TeamGoalsScored from '../models/teamGoalsScored.model.js';
import TeamStats from '../models/teamStats.model.js';

export const getTeamGoals = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.teamId).populate({
      path: 'league',
      select: 'name',
      populate: {
        path: 'season',
        select: 'name',
      },
    });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const teamGoals = await TeamStats.find({
      team: req.params.teamId,
      season: team?.league?.season?._id,
    });
    console.log(teamGoals);

    const goalsLostCount = teamGoals.reduce((acc, curr) => {
      return acc + curr.goalsAgainst;
    }, 0);

    const goalsScoredCount = teamGoals.reduce((acc, curr) => {
      return acc + curr.goalsFor;
    }, 0);

    console.log(goalsLostCount, goalsScoredCount);

    const existingTeamGoalsScored = await TeamGoalsScored.findOne({
      team: req.params.teamId,
      season: team?.league?.season,
    });

    const existingTeamGoalsLost = await TeamGoalsLost.findOne({
      team: req.params.teamId,
      season: team?.league?.season,
    });

    if (existingTeamGoalsScored) {
      existingTeamGoalsScored.goals = goalsScoredCount;
      await existingTeamGoalsScored.save();
    } else {
      await TeamGoalsScored.create({
        team: req.params.teamId,
        goals: goalsScoredCount,
        season: team?.league?.season,
      });
    }

    if (existingTeamGoalsLost) {
      existingTeamGoalsLost.goals = goalsLostCount;
      await existingTeamGoalsLost.save();
    } else {
      await TeamGoalsLost.create({
        team: req.params.teamId,
        goals: goalsLostCount,
        season: team?.league?.season,
      });
    }

    res.status(200).json({
      goalsScored: [
        {
          league: team?.league?.name,
          season: team?.league?.season?.name,
          count: goalsScoredCount,
        },
      ],
      goalsLost: [
        {
          league: team?.league?.name,
          season: team?.league?.season?.name,
          count: goalsLostCount,
        },
      ],
    });
  } catch (error) {
    next(error);
  }
};