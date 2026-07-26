export function metersPerSecondToKph(mps: number): number {
  return mps * 3.6;
}
export function metersPerSecondToMph(mps: number): number {
  return mps * 2.237;
}
export function kphToMps(kph: number): number {
  return kph / 3.6;
}
export function mphToMps(mph: number): number {
  return mph / 2.237;
}
export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}
export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}
export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}
export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}
export function kmToMiles(km: number): number {
  return km * 0.621371;
}
export function milesToKm(miles: number): number {
  return miles / 0.621371;
}
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}
