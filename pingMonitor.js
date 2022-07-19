const { appendFile, readFile, writeFile } = require('fs/promises')
const { networkInterfaces } = require('os')
const { createReadStream } = require("fs")
const readline = require('readline')
const { exit } = require('process')
const { resolve, format } = require('path')
const ping = require('ping')
const http = require("http")


const args = process.argv.slice(2);

const file = args[1] || format({
    dir: 'C:\\',
    base: 'logPing.json'
})
const html = args[1] || resolve(__dirname, 'index.html')

const getDate = (date) => {
    const TZ_BR = -3
    function addRightZero(number) {
        if (number < 10) {
            number = `0${number}`
            return number
        }
        return number
    }
    const day = addRightZero(date.getDate())
    const month = addRightZero(date.getMonth() + 1)
    const year = date.getFullYear()
    const hours = addRightZero(date.getHours())
    const minutes = addRightZero(date.getMinutes())
    const seconds = addRightZero(date.getSeconds())

    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}h`
}

async function pingMonitor(ip) {
    const result = await ping.promise.probe(ip);
    return result
}

async function logger(file, log) {
    const date = getDate(new Date())
    const text = {
        date,
        host: log.host,
        avg_time: `${log.time != 'unknown' ? log.time : '0 ms'}`,
        alive: log.alive,
        packageLoss: `${log.packetLoss}%`
    }
    const logInJson = JSON.stringify(text)
    await appendFile(file, `${logInJson}\n`, 'utf-8')
}

async function start(ip) {
    try {
        await writeFile(file, '', 'utf-8')
    }
    catch (err) { }
    try {
        if (!ip) throw new Error('Invalid IP')

        const header = {
            title: 'Log de comunicação',
            host: ip,
            startDate: getDate(new Date()),
        }
        await appendFile(file, `${JSON.stringify(header)}\n`, 'utf-8')
        setInterval(async () => {
            const pingLog = await pingMonitor(ip)
            await logger(file, pingLog)
        }, 6000)
    } catch (error) {
        const errorLog = {
            error: error.message,
            date: new Date()
        }
        const errorJson = JSON.stringify(errorLog)
        await appendFile(file, `${errorJson}\n`, 'utf-8')
        console.log('An error has ocurred, check the logs')
        exit(1)
    }
}

function logExit() {
    return '"footer":' + JSON.stringify({
        endDate: getDate(new Date()),
    })
}

process.on('SIGINT', async () => {
    console.log("Terminating...");
    await appendFile(file, `${logExit()}\n`, 'utf-8')
    process.exit(0);
});

const webLog = () => {
    const port = process.env.PORT || 3000
    const requestListener = async (req, res) => {
        const { url } = req

        const logJson = async (req, res) => {
            const lineReader = readline.createInterface({
                input: createReadStream(file),
                crlfDelay: Infinity,

            });
            const dataJson = []
            for await (const line of lineReader) {
                dataJson.push(JSON.parse(line))
            }

            res.statusCode = 200
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify(dataJson));
        }

        const indexHtml = async (req, res) => {
            const file = await readFile(html, { encoding: 'utf-8' })
            res.statusCode = 200
            res.setHeader("Content-Type", "text/html")
            res.end(file);
        }

        const form = async (req, res) => {
            const html = resolve(__dirname, 'form.html')
            const file = await readFile(html, { encoding: 'utf-8' })
            const interface = networkInterfaces().Ethernet.find(i => i.family =='IPv4')
            const rendered =  file.toString().replace('#IP#', `${interface.address}`)
            res.statusCode = 200
            res.setHeader("Content-Type", "text/html")
            res.end(rendered)
        }

        const notFound = async (req, res) => {
            res.statusCode = 400
            res.setHeader("Content-Type", "application/json")
            res.end('<h1 style="text-align=center">404<br />NOT FOUND</h1>');
        }

        switch (url) {
            case '/index':
                await indexHtml(req, res)
                break;
            case '/logs':
                await logJson(req, res)
                break;
            case '/':
                await form(req, res)
                break;

            default: form(req, res)
                break;
        }
    }

    const server = http.createServer(requestListener)

    server.listen(port, () => {
        console.log(`The logs are available on the web page: http://localhost:${port}`)
    })
}

start(args[0], args[1])
    .then(() => webLog())