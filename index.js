function modifyVCalBody(originalBody, timeshift) {
  timeshift = parseInt(timeshift)
  if (isNaN(timeshift) || timeshift < 0 || timeshift > 60) {
    timeshift = 15;
  }

  var headerSet = false;
  var modifiedBody = '';
  const dateMatch = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/s;
  originalBody
      .replaceAll("\r\n", "\n")
      .split("BEGIN:VEVENT\n")
      .forEach(vevent => {
        if (headerSet === false) {
          if (vevent.substring(0,16) !== "BEGIN:VCALENDAR\n") {
            console.error('This is not an iCal source! (sig: >>' + vevent.substring(0,15) + '<<)');
            throw 'Not iCal!';
          }

          modifiedBody += vevent;
          headerSet = true;
          return;
        }

        const currentEvent = new Map();
        currentEvent.set("BEGIN", "VEVENT");
        let currentField = null;
        vevent.split("\n").forEach(str => {
          if (currentField !== null && str[0] === "\t") { //Continue previous field data
            currentEvent.set(currentField[0], currentField[1] += "\n" + str); //to get unwrapped one use str.substring(1)

            return;
          }

          if (str === '') { //Don't "split" empty lines creating bogus "fields"
            return;
          }

          let kv = str.split(/:(.+)?/)

          //Hack for last event end (END:VCALENDAR will override it)
          if (kv[0] === 'END' && currentEvent.has('END')) {
            return;
          }

          let value = kv[1];
          if (value === undefined) {
            value = '';
          }
          currentField = [kv[0], value];
          currentEvent.set(kv[0], value);
        });

        /****** DO SOME MODS ON EVENT ******/
        //Add course to event name
        if (currentEvent.has('CATEGORIES')) {
          currentEvent.set('SUMMARY', currentEvent.get('SUMMARY') + ' [' + currentEvent.get('CATEGORIES') + ']');
        }

        //Make sure events lasting no time (i.e. point events) have some time for better UX
        const evStart = currentEvent.get('DTSTART');
        const evEnd = currentEvent.get('DTEND');
        if (evStart === evEnd) {
          const evStartSplit = dateMatch.exec(evStart); //The only way to "parse" custom date format in JS is regex

          const evShiftStart = new Date(
              //Date() constructor works on local time only UNLESS provided with UNIX timestamp... then it uses UTC
              //So we need to create UNIX timestamp to then create Date() with it....
              Date.UTC(
                  evStartSplit[1],
                  parseInt(evStartSplit[2]) - 1, //JS months are 0-based
                  evStartSplit[3],
                  evStartSplit[4],
                  evStartSplit[5],
                  evStartSplit[6],
                  0
              )
          );
          evShiftStart.setMinutes(evShiftStart.getMinutes() - timeshift); //Timeshift event start 15 minutes back

          let months = evShiftStart.getUTCMonth() + 1; //Because 0-based month makes a PERFECT sense ffs
          let days = evShiftStart.getUTCDate(); //...because getDay() returns day of the week, logical, of course...
          let hours = evShiftStart.getUTCHours();
          let minutes = evShiftStart.getUTCMinutes();
          let seconds = evShiftStart.getUTCSeconds();

          //Now we need to manually add leading zeros
          if (months < 10) { months = '0' + months; }
          if (days < 10) { days = '0' + days; }
          if (hours < 10) { hours = '0' + hours; }
          if (minutes < 10) { minutes = '0' + minutes; }
          if (seconds < 10) { seconds = '0' + seconds; }

          //...and use string concatenation to recreate the date
          currentEvent.set('DTSTART', '' + evShiftStart.getUTCFullYear() + months + days + 'T' + hours + minutes + seconds + 'Z');
        }
        /****** END OF MODS ON EVENT ******/

        //Reassemble event
        currentEvent.forEach((value, key) => {
          modifiedBody += key + ':' + value + "\n";
        });
      });
  modifiedBody += "END:VCALENDAR\n";

  return modifiedBody;
}

function getErrorResponse(text) {
  const html = `<!DOCTYPE html>
  <body>
    <h1>Oh no! Error!</h1>
    <p>Cannot modify calendar: ` + text + `</p>
    <p>Usage: /start_shift=5/https://school.moodledemo.net/calendar/export_execute.php?userid=1&authtoken=3d8e84dde04af9758df7e13efff197f2c68cfc0a&preset_what=all&preset_time=recentupcoming</p>
  </body>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
    },
  });
}


async function handleRequest(request) {
  // console.log(url.pathname);

  //Validate URL
  const url = new URL(request.url)
  params = /^\/(.+)\/http/s.exec(url.pathname)
  if (params === null) {
    return getErrorResponse('no parameters found');
  }
  params = params[1]

  let vcalUrl = url.pathname
      .substring(params.length + 2)
      .replace('https:/', 'https://') //Small hack on URL parser in CF workers (works on node w/o this ¯\_(ツ)_/¯)
      .replace('http:/', 'http://');
  if (/\/calendar\/export_execute\.php$/.exec(vcalUrl) === null) {
    return getErrorResponse('invalid original URL');
  }
  vcalUrl += url.search;

  //Extract parameters
  const paramsKV = new Map()
  params.split(';').forEach(v => {
    const kv = v.split('=', 2);
    paramsKV.set(kv[0], kv[1] || null);
  });


  //Fetch the original
  const originalResponse = await fetch(vcalUrl);
  if (originalResponse.status < 200 || originalResponse.status > 299) {
    return getErrorResponse('failed to fetch source (code: ' + originalResponse.status + ')');
  }
  const originalBody = await originalResponse.text() + '';

  //Modify the ics
  console.log(paramsKV)
  modifiedBody = modifyVCalBody(originalBody, paramsKV.get('start_shift') || 15);

  //...and send it back
  const response = new Response(modifiedBody, {
    status: 200,
    headers: originalResponse.headers,
  });
  response.headers.set("X-Moodle-Cal-Mod", "1")

  return response;
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})
