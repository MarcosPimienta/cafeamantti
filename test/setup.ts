// Pin the clock-sensitive bits: Colombia has no DST, tests assume UTC-5.
process.env.TZ = "America/Bogota";
