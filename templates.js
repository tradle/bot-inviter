
const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const clone = require('clone')
const STRINGS = require('./strings')
const {
  format,
  humanize
} = require('./utils')
const DEFAULT_CONFIRM_ARGS = {
  action: {
    text: 'Confirm Email Address'
  },
  blocks: [
    { body: 'Please confirm your email address by clicking the link below' },
    { body: 'Once you do, we can send you an invitation to install the Tradle iOS app' }
  ],
  signature: 'Tradle team',
  twitter: 'tradles'
}

const DEFAULT_NOTIFY_ARGS = {
  blocks: [],
  signature: 'Inviter bot'
}

const templates = {
  email: {
    invite: readTemplate('./templates/email/invite/inlined.hbs'),
    notifyInviter: readTemplate('./templates/email/notify/inlined.hbs')
  },
  page: {
    confirmation: readTemplate('./templates/page/confirmation/inlined.hbs')
  }
}

function genConfirmationPage (templateArgs) {
  return templates.page.confirmation(templateArgs)
}

function genNotifyInviterEmail (user, templateArgs=DEFAULT_NOTIFY_ARGS) {
  const subject = format(STRINGS.NOTIFY_INVITER, user.profile.firstName, user.profile.lastName)
  templateArgs = clone(templateArgs)
  templateArgs.blocks.push({ body: STRINGS.APPLICATION_DETAILS })
  const profile = user.profile
  for (let prop in profile) {
    if (prop[0] === '_') continue

    let val = profile[prop]
    // TODO: use the underlying model
    if (typeof val === 'number' && isDateOrTime(prop)) {
      val = new Date(val)
    }

    templateArgs.blocks.push({
      body: `${humanize(prop)}: ${val}`
    })
  }

  const html = templates.email.notifyInviter(templateArgs)
  return { html, subject }
}

function genInviteEmail (user, opts={}) {
  let {
    host,
    port,
    subject=STRINGS.DEFAULT_SUBJECT,
    templateArgs=DEFAULT_CONFIRM_ARGS
  } = opts

  templateArgs = clone(templateArgs)
  templateArgs.blocks.unshift({
    body: `Hi ${user.profile.firstName}!`
  })

  templateArgs.action.link = `http://${host}:${port}/confirmemail/${user.confirmEmailCode}`
  const html = templates.email.invite(templateArgs)
  return { html, subject }
}

module.exports = {
  email: {
    invite: genInviteEmail,
    notifyInviter: genNotifyInviterEmail
  },
  page: {
    confirmation: genConfirmationPage
  }
}

function readTemplate (file) {
  const absPath = path.resolve(__dirname, file)
  const uncompiled = fs.readFileSync(absPath, { encoding: 'utf8' })
  return handlebars.compile(uncompiled)
}

function isDateOrTime (prop) {
  return (/date|time/).test(prop)
}
