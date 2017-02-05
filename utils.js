
// source: http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
exports.format = function format (str, ...args) {
  return str.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] !== 'undefined'
      ? args[number]
      : match
    ;
  })
}

exports.moan = function (min=2, max=30) {
  const length = min + Math.random() * (max - min)
  return `${randomRepeat('o', length / 3)}${randomRepeat('h', 2 * length / 3)}`
}

function randomRepeat (str, length) {
  return str.repeat(1 + Math.random() * length | 0)
}
