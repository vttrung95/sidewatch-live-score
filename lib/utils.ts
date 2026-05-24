/**
 * Returns today's date as YYYY-MM-DD in **UTC**.
 *
 * MLB game dates are tied to US timezones. Using UTC (rather than the
 * browser's local timezone) prevents UTC+N users whose local clock has
 * already rolled past midnight from querying tomorrow's not-yet-started
 * slate while the live games are still running under today's US date.
 */
export function getTodayDate(): string {
  return utcDate(new Date())
}

export function getYesterdayDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return utcDate(d)
}

function utcDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatGameTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    return isoString
  }
}

export const TEAM_ABBREVIATIONS: Record<string, string> = {
  'Arizona Diamondbacks': 'ARI',
  'Atlanta Braves': 'ATL',
  'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS',
  'Chicago White Sox': 'CWS',
  'Chicago Cubs': 'CHC',
  'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE',
  'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET',
  'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA',
  'Los Angeles Dodgers': 'LAD',
  'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL',
  'Minnesota Twins': 'MIN',
  'New York Yankees': 'NYY',
  'New York Mets': 'NYM',
  'Athletics': 'ATH',
  'Philadelphia Phillies': 'PHI',
  'Pittsburgh Pirates': 'PIT',
  'San Diego Padres': 'SD',
  'San Francisco Giants': 'SF',
  'Seattle Mariners': 'SEA',
  'St. Louis Cardinals': 'STL',
  'Tampa Bay Rays': 'TB',
  'Texas Rangers': 'TEX',
  'Toronto Blue Jays': 'TOR',
  'Washington Nationals': 'WSH',
}

export function getTeamAbbr(teamName: string): string {
  return TEAM_ABBREVIATIONS[teamName] ?? teamName.slice(0, 3).toUpperCase()
}

export const TEAM_SUBREDDITS: Record<string, string> = {
  'Arizona Diamondbacks': 'azdiamondbacks',
  'Atlanta Braves': 'Braves',
  'Baltimore Orioles': 'orioles',
  'Boston Red Sox': 'redsox',
  'Chicago White Sox': 'whitesox',
  'Chicago Cubs': 'CHICubs',
  'Cincinnati Reds': 'reds',
  'Cleveland Guardians': 'ClevelandGuardians',
  'Colorado Rockies': 'coloradorockies',
  'Detroit Tigers': 'motorcitykitties',
  'Houston Astros': 'Astros',
  'Kansas City Royals': 'KCRoyals',
  'Los Angeles Angels': 'angelsbaseball',
  'Los Angeles Dodgers': 'Dodgers',
  'Miami Marlins': 'letsgofish',
  'Milwaukee Brewers': 'Brewers',
  'Minnesota Twins': 'minnesotatwins',
  'New York Yankees': 'NYYankees',
  'New York Mets': 'NewYorkMets',
  'Athletics': 'OaklandAthletics',
  'Philadelphia Phillies': 'phillies',
  'Pittsburgh Pirates': 'buccos',
  'San Diego Padres': 'Padres',
  'San Francisco Giants': 'SFGiants',
  'Seattle Mariners': 'Mariners',
  'St. Louis Cardinals': 'Cardinals',
  'Tampa Bay Rays': 'TampaBayRays',
  'Texas Rangers': 'TexasRangers',
  'Toronto Blue Jays': 'Torontobluejays',
  'Washington Nationals': 'Nationals',
}

export function getTeamSubreddit(teamName: string): string {
  return TEAM_SUBREDDITS[teamName] ?? 'baseball'
}

export const REDDIT_EXCLUSION_KEYWORDS = [
  'dead', 'dies', 'passing', 'optioned', 'minors',
  'aaa', 'trade', 'sign', 'contract', 'injury', 'dl', 'il',
  'suspended', 'fined', 'arrested', 'dfa',
]

export function shouldExcludePost(title: string): boolean {
  const lower = title.toLowerCase()
  return REDDIT_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw))
}
