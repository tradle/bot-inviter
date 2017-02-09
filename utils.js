const Promise = require('bluebird')
const co = Promise.coroutine
const promisifyAll = Promise.promisifyAll

exports.Promise = Promise
exports.co = co
exports.promisifyAll = promisifyAll

// source: http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
exports.format = function format (str, ...args) {
  return str.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] === 'undefined'
      ? match
      : args[number]
    ;
  })
}

exports.humanize = function humanize (varName) {
  let humanized = splitCamelCase(varName)
  humanized = humanized[0].toUpperCase() + humanized.slice(1)
  return humanized
}

/**
 * Generate a random moan (e.g. ooooooohhhh)
 */
exports.moan = function (min=2, max=30) {
  /* eslint no-mixed-operators: "off" */
  const length = min + Math.random() * (max - min)
  const o = randomRepeat('o', length / 3)
  const h = randomRepeat('h', 2 * length / 3)
  return `${o}${h}`
}

function randomRepeat (str, length) {
  /* eslint no-mixed-operators: "off" */
  return str.repeat(1 + Math.floor(Math.random() * length))
}

function splitCamelCase (str) {
  return str.split(/(?=[A-Z])/g).join(' ')
}
