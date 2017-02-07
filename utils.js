const Promise = require('bluebird')
const co = Promise.coroutine
const promisifyAll = Promise.promisifyAll

exports.Promise = Promise
exports.co = co
exports.promisifyAll = promisifyAll

// source: http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
exports.format = function format (str, ...args) {
  return str.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] !== 'undefined'
      ? args[number]
      : match
    ;
  })
}

exports.humanize = function humanize (varName) {
  let humanized = splitCamelCase(varName)
  humanized = humanized[0].toUpperCase() + humanized.slice(1)
  return humanized
}

exports.moan = function (min=2, max=30) {
  const length = min + Math.random() * (max - min)
  return `${randomRepeat('o', length / 3)}${randomRepeat('h', 2 * length / 3)}`
}

function randomRepeat (str, length) {
  return str.repeat(1 + Math.random() * length | 0)
}

function splitCamelCase (str) {
  return str.split(/(?=[A-Z])/g).join(' ')
}
