import League from '../models/league.model.js';
import Match from '../models/match.model.js';
import Round from '../models/round.model.js';
import Team from '../models/team.model.js';
import moment from 'moment';
import cron from 'node-cron';

cron.schedule('0 0 * * *', async () => {
  try {
    const currentDate = new Date();

    const activeMatchesToUpdate = await Match.find({
      isCompleted: false,
      endDate: { $lt: currentDate },
    });

    for (const matchToUpdate of activeMatchesToUpdate) {
      matchToUpdate.isCompleted = true;
      await matchToUpdate.save();
    }

    console.log('Updated matches: ', activeMatchesToUpdate.length);
  } catch (error) {
    console.log(error);
  }
});

export const generateMatchSchedule = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const teams = await Team.find({ league: req.params.id });

    if (!teams || teams.length < 2) {
      return res
        .status(404)
        .json({ message: 'Not enough teams found to generate schedule' });
    }

    const startDate = moment(req.body?.startDate);

    if (!startDate.isValid()) {
      return res.status(400).json({ message: 'Invalid start date' });
    }

    // Ensure there are enough teams for a proper schedule
    if (teams.length !== 16) {
      return res.status(400).json({
        message: 'Number of teams must be 16 for this schedule',
      });
    }

    const shuffledTeams = shuffleArray(teams);

    const matches = [];
    let currentDate = startDate.clone().startOf('week').isoWeekday('Saturday');

    let teamss = [...shuffledTeams];

    if (teamss.length % 2 !== 0) {
      teamss.push(null);
    }

    const numTeams = teamss.length;
    const numRounds = numTeams - 1;
    const numMatchesPerRound = numTeams / 2;

    let matchesInRound;

    for (let round = 0; round < numRounds; round++) {
      matchesInRound = [];

      for (let i = 0; i < numMatchesPerRound; i++) {
        let homeTeam, awayTeam;

        if (round % 2 === 0) {
          homeTeam = teamss[i];
          awayTeam = teamss[numTeams - 1 - i];
        } else {
          awayTeam = teamss[i];
          homeTeam = teamss[numTeams - 1 - i];
        }

        const matchDateSaturday = generateMatchDate(
          currentDate,
          round,
          'Saturday'
        );
        const matchDateSunday = generateMatchDate(currentDate, round, 'Sunday');

        matchesInRound.push({
          homeTeam,
          awayTeam,
          league: req.params.id,
          season: req.body.seasonId,
          startDate:
            i % 2 === 0 ? matchDateSaturday.toDate() : matchDateSunday.toDate(),
          endDate: generateMatchEndDate(
            i % 2 === 0 ? matchDateSaturday : matchDateSunday
          ),
          round: null,
        });
      }

      teamss.splice(1, 0, teamss.pop());

      matches.push(matchesInRound);

      // Move the start date for the next round by a week
      currentDate = currentDate.clone().add(1, 'week').isoWeekday('Saturday');
    }

    const flattenedMatches = matches.flat();

    const newMatches = await Match.insertMany(flattenedMatches);

    const rounds = [];

    for (let i = 0; i < matches.length; i++) {
      const roundStartDate = flattenedMatches[i * (teams.length / 2)].startDate;
      const roundEndDate =
        flattenedMatches[(i + 1) * (teams.length / 2) - 1].endDate;
      const round = new Round({
        name: `Round ${i + 1} - ${moment(roundStartDate).format(
          'MMM DD, YYYY'
        )}`,
        startDate: roundStartDate,
        endDate: roundEndDate,
        season: req.body.seasonId,
        league: req.params.id,
      });
      round.matches = newMatches
        .slice(i * (teams.length / 2), (i + 1) * (teams.length / 2))
        .map((match) => {
          match.round = round._id;
          match.save();
          return match._id;
        });

      rounds.push(round);
    }

    await Round.insertMany(rounds);

    const populatedMatches = await Match.populate(newMatches, {
      path: 'homeTeam awayTeam',
      select: 'name',
    });

    res.status(201).json(populatedMatches);
  } catch (error) {
    next(error);
  }
};

// Function to generate the date and time of a match
function generateMatchDate(currentDate, round, day) {
  let matchDate = currentDate.clone().add(round, 'weeks').isoWeekday(day);

  if (matchDate.isBefore(moment(), 'day')) {
    matchDate = matchDate.add(1, 'week');
  }

  matchDate = matchDate.hour(Math.floor(Math.random() * 7) + 11).minute(0);

  return matchDate;
}

// Function to generate the end date and time of a match
function generateMatchEndDate(startDate) {
  return startDate.clone().add(2, 'hours').toDate();
}

// Function to shuffle an array
function shuffleArray(array) {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
}

export const saveSchedule = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const matches = await Match.find({ league: req.params.id });
    if (!matches) {
      return res.status(404).json({ message: 'Matches not found' });
    }

    const newMatches = await Match.insertMany(matches);
    res.status(201).json(newMatches);
  } catch (error) {
    next(error);
  }
};

export const getSchedule = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const matches = await Match.find({ league: req.params.id })
      .populate('homeTeam', 'name')
      .populate('awayTeam', 'name')
      .populate('league', 'name');

    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
};

export const deleteMatchesByLeagueId = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const matches = await Match.find({ league: req.params.id });
    if (!matches) {
      return res.status(404).json({ message: 'Matches not found' });
    }

    const deletedMatches = await Match.deleteMany({ league: req.params.id });
    res.status(201).json(deletedMatches);
  } catch (error) {
    next(error);
  }
};

export const getMatchesByTeamId = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const matches = await Match.find({
      $or: [{ homeTeam: req.params.id }, { awayTeam: req.params.id }],
    })
      .populate('homeTeam', 'name')
      .populate('awayTeam', 'name')
      .populate('league', 'name')
      .populate('round', 'name');

    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
};

export const getMatchById = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('homeTeam', '_id, name')
      .populate('awayTeam', '_id, name')
      .populate('league', 'name')
      .populate('round', 'name');

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    res.status(200).json(match);
  } catch (error) {
    next(error);
  }
};

export const editMatch = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const updatedMatch = await Match.findByIdAndUpdate(
      req.params.id,
      {
        homeTeam: req.body?.homeTeam,
        awayTeam: req.body?.awayTeam,
        startDate: req.body?.startDate,
      },
      { new: true }
    );

    res.status(201).json(updatedMatch);
  } catch (error) {
    next(error);
  }
};

export const getCompletedMatchesByLeagueId = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const matches = await Match.find({
      league: req.params.id,
      isResultApproved: false,
      isCompleted: true,
    })
      .populate('homeTeam', 'name')
      .populate('awayTeam', 'name')
      .populate('league', 'name')
      .populate('round', 'name');

    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
};

export const getFilledMatchesByLeagueId = async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const matches = await Match.find({
      league: req.params.id,
      isResultApproved: true,
    })
      .populate('homeTeam', 'name')
      .populate('awayTeam', 'name')
      .populate('league', 'name')
      .populate('round', 'name');

    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
};

export const getSeasonByMatchId = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    res.status(200).json(match.season);
  } catch (error) {
    next(error);
  }
};
