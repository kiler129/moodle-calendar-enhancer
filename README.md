# 📅 Moodle Calendar Enhancer


## What is this?
Some small things annoy me more than others. Two of them were related to, overall great, Moodle platform:
 - Events with due dates are exported as 0-minutes points (which is annoying to work with in a calendar)
 - Items from courses don't include course name
 
This small script, deployable as Cloudflare Worker, fixes these two problems.


## How does it work?
1. The script adds course "category" (which is usually the course code, e.g. `MTH3500FA20`) at the end of a name of every 
calendar event.
2. The script shifts start time of events if it's the same as the end time by a set number of minutes (default: -15)


## How can I use it?
The code is pretty universal and can be easily modified for any scenario. The intended deployment route is via 
[Cloudflare Workers](http://workers.cloudflare.com).

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kiler129/YOURREPO)


After deployment go to `https://moodle.example.com/calendar/export.php` and after setting everything click 
***"Get calendar URL"**. You will get a link like so:

```
https://moodle.example.com/calendar/export_execute.php?userid=1&authtoken=some_chars&preset_what=all&preset_time=recentupcoming
```

Simply prepend it with worker URL & settings:
```
https://moodle-calendar-enhancer.your_domain.workers.dev/start_shift=5/https://moodle.example.com/calendar/export_execute.php?userid=1&authtoken=some_chars&preset_what=all&preset_time=recentupcoming
```

## Configuration options
Currently only one option is available (and present in the example above):

- `start_shift` *(default: 15; range: 0-60)*: number of minutes the start of an event is shifted back
