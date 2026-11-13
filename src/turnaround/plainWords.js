// Plain-English help for the Overview: one intro per deep dive and one how-to-read line per chart,
// written for someone new to the numbers. Kept here so the wording can be changed in one place; the
// Overview (components/Overview.jsx) looks each one up by deep dive id and chart key.
import { DETENTION, DOCK_TARGET, G2G_TARGET, ON_TIME_WINDOW, STAGE_TARGETS } from './targets'

const G2G = G2G_TARGET.max
const DOCK = DOCK_TARGET.max
const FREE_H = DETENTION.freeMin / 60
// The impact pages compare the whole wait for a dock (waiting for the order + dock assignment).
const ORDER = STAGE_TARGETS.find((s) => s.key === 'orderWait')
const ASSIGN = STAGE_TARGETS.find((s) => s.key === 'dockAssign')
const WAIT = { min: ORDER.min + ASSIGN.min, max: ORDER.max + ASSIGN.max }

// Charts on the main Overview page, by the name the page gives them.
export const OVERVIEW_PLAIN = {
  impactStages: 'Two dots for each step of a visit: grey is how long it took on paper, teal is how long it takes now. A longer gap means a bigger saving.',
  impactWeekday: `For each day of the week, the paper bar next to the app bar. Bars under the red line finished in time (${G2G} minutes).`,
  impactDetention: 'The same days of the week, counting the money carriers could charge us. Shorter red bars mean less money paid.',
  stagesByDay: `Each day is a tower of blocks, one block for each step of the visit. A taller tower is a slower day, and the biggest block is the step to look at. The red line is the ${G2G}-minute limit.`,
  stageTargets: 'Each step has a green "just right" zone. A bar that goes past its zone is slow, so the reddest bar is the step to fix first.',
  typesPerDay: 'How many trucks came each day, and what they came for: a pickup or a dropped trailer. A taller bar means a busier day.',
  dockWait: 'Each day, how long the average truck waited before it got a dock, in two parts: grey is waiting for its order to be ready, blue is waiting for a dock after that. A tall grey block means the product was not ready; a tall blue block means the docks were full or nobody assigned one.',
  arrivalDonut: `A pie of all the trucks: early, on time (within ${ON_TIME_WINDOW} minutes of the booking) or late. The bigger the dark slice, the better.`,
  apptHour: `How many trucks were booked for each hour. A red bar means those trucks took too long, which usually means too many were booked at once.`,
  lateScatter: `One dot per truck. Dots further right came later, and dots higher up stayed longer. If the late dots sit high above the red line, late arrivals are slowing us down.`,
}

// The six headline-card deep dives.
export const KPI_PLAIN = {
  g2g: {
    intro: 'This page breaks the whole visit apart, so you can see which days, kinds of truck and carriers take the longest.',
    panels: {
      stages: `Each day's average truck as a tower of blocks, one block per step. Look for the tallest tower, then its biggest block. Towers above the red line went over ${G2G} minutes.`,
      split: `A pie of every truck: green finished in ${G2G} minutes or less, red took longer. You want the green slice as big as possible.`,
      type: 'Pickups and drop trailers side by side. The longer bar is the kind of visit that takes the most time.',
      carrier: 'Every trucking company, slowest at the top. Red bars are companies whose trucks usually stay too long.',
    },
    table: 'Every truck counted above, slowest first, so you can find the visits that pulled the number up.',
  },
  dock: {
    intro: 'This page looks only at the time a truck spends parked at the dock door, so you can see if the dock crew or the waiting is the slow part.',
    panels: {
      parts: `Each day's average dock time, split into getting the trailer ready, loading and inspection. Towers above the red line went over ${DOCK} minutes.`,
      spread: 'How many trucks took each amount of time at the dock. Green is quick, gold is normal, red is too long. Most bars should be green or gold.',
      docks: 'The average time at each dock door. A red bar is a dock that is usually slow; check its crew or equipment.',
      carrier: 'Every trucking company, slowest at the dock first. Some loads simply take longer than others.',
    },
    table: 'Every truck counted above, longest at the dock first.',
  },
  ontime: {
    intro: 'This page shows whether trucks come when they were booked to, and which hours and companies are late most often.',
    panels: {
      days: 'Trucks each day, colored by early, on time or late. More of the on-time color means a smoother day.',
      split: 'A pie of every truck: early, on time or late. The number in the middle is the on-time share.',
      hours: 'The same colors for each booked hour. An hour with a lot of late color is a time slot that often runs behind.',
      carrier: 'Every trucking company, best at being on time first. The short bars at the bottom are the ones to talk to.',
    },
    table: 'Every truck counted above, latest first. A minus number means it came early.',
  },
  trucks: {
    intro: 'This page shows how busy the gate was: how many trucks came, what for, at what time and from which companies.',
    panels: {
      days: 'Trucks each day, colored by what they came for. A taller bar is a busier day.',
      mix: 'A pie of what the trucks came for: a pickup (the driver waits) or a dropped trailer to load. The middle shows the total.',
      hours: 'Trucks booked for each hour of the day. The tallest bars are the rush hours, when the gate and docks need the most people.',
      carrier: 'The companies that sent us the most trucks, biggest first.',
    },
    table: 'Every truck counted above, in the order they arrived.',
  },
  within: {
    intro: `This page counts how many single trucks finished in ${G2G} minutes or less, because a good average can hide a few very slow trucks.`,
    panels: {
      days: `Each day's trucks: green finished in time, red went over ${G2G} minutes. Days with a lot of red are worth a closer look.`,
      type: 'For pickups and drop trailers, the share that finished in time. A shorter bar is the kind of visit that goes over most.',
      late: 'One dot per truck. Dots further right came later, and red dots went over the limit. If most red dots are on the right, late arrivals are the problem.',
      carrier: 'Each trucking company, best first: the share of its trucks that finished in time.',
    },
    table: 'Every truck counted above, slowest first.',
  },
  detention: {
    intro: `This page shows the money carriers could charge us for keeping their trucks too long: ${FREE_H} hours are free, then $${DETENTION.ratePerHour} for every extra hour.`,
    panels: {
      days: 'The money at risk each day. A tall bar is an expensive day.',
      total: 'The money adding up day by day. A steep jump is a day when a lot of trucks were held too long.',
      held: `One dot per truck. Red dots will be charged and teal dots won't. Dots above the red line stayed over ${FREE_H} hours. Trucks that came very late aren't charged, because that was their fault.`,
      carrier: 'Each trucking company, biggest charge first. Grey means no charge.',
    },
    table: 'Every truck counted above, biggest charge first.',
  },
}

// The six "Impact of going digital" deep dives. Orange (or grey) is the paper week, teal is the app.
export const IMPACT_PLAIN = {
  g2g: {
    intro: 'This page shows how much faster a visit is now than on paper, and which steps gave back the most minutes.',
    panels: {
      waterfall: 'Start with the paper-week visit on the left, take away the minutes saved at each step, and you end with today\'s visit on the right. The biggest step down is the biggest win.',
      spread: 'How many trucks took each amount of time, paper week against today. Today\'s bars should sit further to the left, which means quicker.',
      type: 'Pickups and drop trailers: a dot for the paper week and a dot for today. A longer line means a bigger saving.',
      hour: 'Visit time for trucks arriving at each hour, paper week against today. The shaded gap between the two lines is the time saved.',
    },
  },
  detention: {
    intro: 'This page shows how much less money we pay carriers for keeping trucks too long, now that everyone works from the same screen.',
    panels: {
      run: 'The money adding up across the week, paper week against today. The shaded gap between the lines is money we kept.',
      past: 'Trucks that were charged, grouped by how long past the free time they stayed. Fewer bars on the right means fewer very long stays.',
      weekday: 'The money at risk on each day of the week, paper week against today.',
      carrier: 'Each trucking company: a dot for the paper week and a dot for today. Red means that company\'s charges went up.',
    },
  },
  dock_wait: {
    intro: 'This page shows how much sooner a truck is told which dock to go to. On paper, this was the longest wait of the visit.',
    panels: {
      hour: `How long trucks waited for a dock, by the hour they arrived. The green stripe is the ${WAIT.min}–${WAIT.max} minute target, and the shaded gap is the time saved.`,
      bands: 'How many trucks waited each amount of time. Today\'s bars should be taller on the left, which means shorter waits.',
      share: `Two pies: paper week and today. The colored slice is the trucks given a dock within ${WAIT.max} minutes.`,
      weekday: 'The average wait on each day of the week: a dot for the paper week and a dot for today.',
    },
  },
  within: {
    intro: `This page shows how many more trucks now finish in ${G2G} minutes or less than on paper.`,
    panels: {
      daily: 'The share of trucks done in time on each day, paper week against today. The shaded gap is the improvement.',
      stages: 'For each step of the visit, the share of trucks that did it in time: a dot for the paper week and a dot for today.',
      type: 'Pickups and drop trailers: the share done in time, paper week against today.',
      over: `The trucks that still went over, grouped by how far over ${G2G} minutes. Fewer bars on the right means fewer very long visits.`,
    },
  },
  phone: {
    intro: 'This page shows the calls, paper slips and yard walks that the shared screen replaced, and the staff time that gives back.',
    panels: {
      staff: 'Staff hours freed each day. Change the minutes per call or per paper slip in the boxes below if your team\'s are different.',
      calls: 'The calls and paper slips needed each day in the paper week. Today the same news shows up on the screen, so this is zero.',
      hour: 'When the phone rang in the paper week. The most calls came in the busiest hours, right when people had the least time.',
      search: 'Minutes spent walking the yard to find a trailer, at each dock, in the paper week. The live yard map now shows where every truck is.',
      swap: 'Each old call or paper slip, next to what does that job on the screen now.',
    },
  },
  hours: {
    intro: 'This page adds up all the time trucks spent with us, to show how much room the yard got back.',
    panels: {
      stages: 'The hours saved at each step of the visit. The longest bar is where most time came back.',
      weekday: 'Total truck hours on site for each day of the week, paper week against today.',
      docks: 'How many hours each dock door was busy, paper week against today. Freed hours are room for more trucks.',
      carrier: 'The driver hours each trucking company got back. Red means that company\'s drivers waited longer.',
    },
  },
}
