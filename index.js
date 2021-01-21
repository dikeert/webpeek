const { app, BrowserWindow } = require('electron')

const DBus = require('dbus')

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

class DBusId {
  constructor (base, obj) {
    this._base = base
    this._obj = obj
  }

  get base () {
    return this._base
  }

  get object () {
    return this._obj
  }

  toString () {
    return this.base
  }

  resolve (path) {
    return new DBusId(`${this}.${path}`)
  }

  get opener () {
    return this.resolve('Opener')
  }
}

const SERVICE = new DBusId('xyz.tmlr.WebView', '/xyz/tmlr/WebView')

class Browser {
  open (url) {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true
      }
    })

    win.removeMenu()
    win.loadURL(`${url}`)
  }
}

class DBusSupport {
  constructor (service) {
    this._service = service
  }

  get service () {
    return this._service
  }
}

class Server extends DBusSupport {
  constructor (service, browser) {
    super(service)
    this._browser = browser
  }

  get browser () {
    return this._browser
  }

  listen () {
    console.log('Starting DBus service')

    const service = DBus.registerService('session', `${this.service}`)
    const obj = service.createObject(this.service.object)

    const opener = obj.createInterface(SERVICE.opener)
    opener.addMethod('Open', {
      in: [DBus.Define(String)],
      out: DBus.Define(String)
    }, (request, callback) => {
      let url
      try {
        url = new URL(request)
      } catch {
        console.log(`Value [${request}] doesn't look like an URL. I need fully qualified URL.`)
      }

      console.log(`Received URL ${url} to open.`)
      callback(null, 'ack')
      this.browser.open(url)
    })
    opener.update()
  }
}

class Client extends DBusSupport {
  sanitize (url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    } else {
      return `http://${url}`
    }
  }

  send (url) {
    console.log(`Sending ${url} to server to open`)

    return new Promise((resolve, reject) => {
      const dbus = DBus.getBus('session')

      dbus.getInterface(`${this.service}`, `${this.service.object}`, `${this.service.opener}`, (err, opener) => {
        if (err) {
          reject(err)
          return
        }

        opener.Open(this.sanitize(url), { timeout: 1000 }, (err, result) => {
          if (err) {
            reject(err)
          }

          resolve(result)
        })
      })
    })
  }
}

const args = yargs(hideBin(process.argv))
  .alias('u', 'url')
  .describe('u', 'Open provided URL in new window')
  .argv

if (args.url) {
  (new Client(SERVICE)).send(args.url)
    .then((_) => console.log(`URL ${args.url} is sent to server`))
    .then((_) => process.exit(0))
    .catch((err) => {
      console.log(`Failed to send URL to server: ${err}`)
      process.exit(3)
    })
} else {
  const server = new Server(SERVICE, new Browser())
  app.whenReady().then(server.listen.bind(server))

  app.on('window-all-closed', () => {
    // no op
  })
}
