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

function positiveFiniteSpeed(metersPerSecond: number): number {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) {
    throw new Error("Speed must be finite and positive");
  }
  return metersPerSecond;
}

/** Calculation-boundary conversion from canonical speed to running pace. */
export function metersPerSecondToSecondsPerKilometer(metersPerSecond: number): number {
  return 1_000 / positiveFiniteSpeed(metersPerSecond);
}

/** Calculation-boundary conversion from canonical speed to swim pace. */
export function metersPerSecondToSecondsPer100Meters(metersPerSecond: number): number {
  return 100 / positiveFiniteSpeed(metersPerSecond);
}

/** Calculation-boundary conversion from canonical speed to elapsed seconds per meter. */
export function metersPerSecondToSecondsPerMeter(metersPerSecond: number): number {
  return 1 / positiveFiniteSpeed(metersPerSecond);
}

/** Input-boundary conversion from running pace to canonical speed. */
export function secondsPerKilometerToMetersPerSecond(secondsPerKilometer: number): number {
  return 1_000 / positiveFiniteSpeed(secondsPerKilometer);
}

/** Input-boundary conversion from mile pace to canonical speed. */
export function secondsPerMileToMetersPerSecond(secondsPerMile: number): number {
  return 1_609.344 / positiveFiniteSpeed(secondsPerMile);
}

/** Input-boundary conversion from swim pace to canonical speed. */
export function secondsPer100MetersToMetersPerSecond(secondsPer100Meters: number): number {
  return 100 / positiveFiniteSpeed(secondsPer100Meters);
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
