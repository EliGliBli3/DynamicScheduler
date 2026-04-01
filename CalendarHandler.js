/* 
Hey hey I apologize for the spaghetti, I commented it up the best I could :')
Not that anybody is reading this... 👁️👁️👁️👁️


!! APPSSCRIPT !!
-- Scrapes the school calendar site --

> The RSS/iCal support that is offered on the source calendar does not contain past events, 
  or events that are more than like 9 months into the future, so scraping is more reliable.
*/

const months = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

/** @type {GoogleAppsScript.Spreadsheet.Spreadsheet}*/
var ss;

/** @type {number}*/
var elementID;


/**
 * @description Acquires and handles the necessary data for the Dynamic Schedule.
 * @param {string} calendarURL 
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} sheetRef 
 */
// Should run once a day in case changes are made to the schedule.
function buildYear(calendarURL, sheetRef){
  this.ss = sheetRef

  const urlOrigin = getURLOrigin(calendarURL);
  elementID = fetchElementID(calendarURL);
  
  var daysOff = [];
  for (var monthInd of months){
    var month = fetchMonth(urlOrigin, monthInd);
    daysOff.push(...month.daysOff);
  }
  daysOff.sort((a, b) => a - b);

  const {startDate, endDate} = fetchStartAndEndDate(urlOrigin);

  populateSheet(daysOff, startDate, endDate);
}

/**
 * @param {string} url 
 * @param {number} month 
 * @returns The link to the FSCalendar's element source page for clean, raw-ish data. 
 */
function getFSUrlFromURL(url, month){
  Logger.log(`Fetching FSUrl from ${url} for month ${month} (id = ${elementID})`)
  return `${url}/fs/elements/${elementID}?cal_date=${getSchoolYear(month)}-${month < 10 ? "0" : ""}${month}-01` + `&_=${Date.now()}`;
  // e.g. https://www.school.com/fs/elements/15255?cal_date=2025-10-26&_=0
}

/**
 * @param {string} url 
 * @param {number} month 
 * @returns The SchoolMonth for any given input 'month' at 'url.'
 */ // Again, probably unnecessary to have a container for it, but I don't really care it's too late :P
function fetchMonth(url, month){
  const schoolMonth = new SchoolMonth(month);
  const fsUrl = getFSUrlFromURL(url, month)
  const html = UrlFetchApp.fetch(fsUrl).getContentText();

  schoolMonth.daysOff = getOffDays(html, month);

  return schoolMonth;
}

/**
 * @param {string} url 
 * @returns The school start and end dates provided by the calendar. Searches the first month and last two months.
 */
function fetchStartAndEndDate(url){
  var startDate;
  var endDate;

  Logger.log("Attempting to fetch start and end dates.");

  for (var month of [months[0], months[months.length-1], months[months.length-2]]){  // Why can't Javascript have negative indice logic </3 </3 I miss python
    const fsURL = getFSUrlFromURL(url, month)

    $ = Cheerio.load(UrlFetchApp.fetch(fsURL).getContentText())
    $('.fsCalendarDaybox.fsStateHasEvents').each((_, daybox) =>{
      if(startDate && endDate) return false;

      const $db = $(daybox);
      const title = $db.find('.fsCalendarEventTitle').first().attr('title');
      
      const $date = $db.find('.fsCalendarDate').first();
      const day = Number($date.attr('data-day'));
      const month = Number($date.attr('data-month'));
      const year = Number($date.attr('data-year'));

      const lowTitle = title.toLowerCase();

      if((lowTitle.includes("trimester 1 start") || lowTitle.includes("first day")) 
        && !startDate){

        startDate = new Date(year, month, day);
      }
      if((lowTitle.includes("last day of school") || lowTitle.includes("trimester 3 end"))
        && !lowTitle.includes("seniors")){

        endDate = new Date(year, month, day);
      }
    })
  }

  if(!startDate){
    const year = getSchoolYear(new Date().getMonth())
    const sepFirst = new Date(year, 8, 1)
    const daysToAdd = ((2-sepFirst.getDay() + 7)%7);

    startDate = new Date(year, 8, 1 + daysToAdd);

    Logger.log(`No start date found. Defaulting to first Tuesday, ${startDate}`)
  }

  return {startDate, endDate}
}

/**
 * @param {string} calendarURL 
 * @returns The HTML element ID of the calendar at calendarURL. Used to access the (mostly) raw data.
 */
function fetchElementID(calendarURL){
  const $ = Cheerio.load(UrlFetchApp.fetch(calendarURL).getContentText())
  const idStr = $('.fsCalendar').attr('id');

  if (idStr){
    const id = idStr.split("_")[1];
    Logger.log(`Detected element ID ${idStr} (${id})`)
    return Number(id);
  }
  return 15216
}

/**
 * @param {string} url 
 * @returns The url without the path. (e.g. https://en.wikipedia.org/wiki/2026_Danish_general_election -> https://en.wikipedia.org)
 */
function getURLOrigin(url){
  const parts = url.split('/');
  return parts[0] + '//' + parts[2];
}

/**
 * @param {string} html 
 * @param {number} targetMonth 
 * @returns A list of days that are marked as "No-School" during a target month. (Excludes early-release for the Elementary school.)
 */
function getOffDays(html, targetMonth){
  /** @type {import('cheerio').CheerioAPI} */
  const $ = Cheerio.load(html)
  const result = new Set();

  $('.fsCalendarDaybox').each((_, daybox) => {
    const $db = $(daybox);

    const hasTargetCat = $db
      .find('.fsStyleSROnly')
      .toArray()
      .some(node => $(node).text().trim().includes('No School'));
    if (!hasTargetCat) return;

    const title = $db.find('.fsCalendarEventTitle').first().attr('title');
    if (!title.toLowerCase().includes("no school")) return;

    const $date = $db.find('.fsCalendarDate').first();
    const day = Number($date.attr('data-day'));
    const month = Number($date.attr('data-month'));
    const year = Number($date.attr('data-year'));

    const date = new Date(year, month, day);

    if(month+1 != targetMonth) return;

    if (!result.has(date)) {
      result.add(date);
    }
  })
  return [...result].sort()
}

/**
 * @param {number} month 1-12, where 1 = January
 * @returns The school year of a given month relative to the current year. (Inputting November (11) would output 2025 if it is past September 2025 and before September 2026.)
 */
function getSchoolYear(month){
  var currYear = new Date().getFullYear();
  var currMonth = new Date().month;

  return currYear + 
  (
    currMonth > 8 ?  // Before the new year
    (month < 9 ? 1 : 0)  // Spill into next year if the month is before September (end of year) and you have not reached the next year
    :
    (month > 8 ? -1 : 0)  // Go back to last year if the month is after September (start of year) and you have already reached the next year
  );
}

/**
 * @description Places data in a new sheet on the Spreadsheet.
 * @param {Array<any>} daysOff 
 */
function populateSheet(daysOff, startDate, endDate){
  const sheetName = "Info"
  var sheet = ss.getSheetByName(sheetName);
  if(!sheet) sheet = ss.insertSheet(sheetName);

  sheet.hideSheet();
  sheet.clearContents();

  sheet.getRange("A1").setValue("No-School Days");
  sheet.getRange("B1").setValue("Start Date");
  sheet.getRange("C1").setValue("End Date");

  for (let i = 0; i < daysOff.length; i++){
    sheet.getRange(`A${i+2}`).setValue(daysOff[i]);
  }

  sheet.getRange("B2").setValue(startDate);
  sheet.getRange("C2").setValue(endDate);
}

// Idk if this was necessary but I already did it so it's staying. It's just a container for a month and its days off.
class SchoolMonth{
  constructor(index){
    this.index = index;
    this.daysOff = []
  }
}