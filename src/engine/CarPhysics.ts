import { destination } from '@turf/turf'

interface CarState {
  speed: number
  angle: number
  steeringAngle: number
}

const MAX_SPEED = 50
const MAX_REVERSE_SPEED = 15
const ACCELERATION = 3
const REVERSE_ACCELERATION = 3
const BRAKE_FORCE = 16
const FRICTION = 2
const TURN_SPEED_BASE = 2.4
const DRIFT_FACTOR = 0.03
const STEERING_RATE = 3.0
const STEERING_RETURN_RATE = 4.0
const STEERING_MAX = 1.0

export class CarPhysics {
  private state: CarState = { speed: 0, angle: 0, steeringAngle: 0 }

  setConsumption(value: number) {
    this._fuelConsumption = value
  }

  private _fuelConsumption = 0.002

  update(
    forward: number,
    rotation: number,
    dt: number,
    fuel: number,
    currentLng: number,
    currentLat: number,
    currentAngle: number,
  ): { lng: number; lat: number; angle: number; fuel: number } {
    this.state.angle = currentAngle

    if (rotation !== 0) {
      this.state.steeringAngle += rotation * STEERING_RATE * dt
      if (Math.abs(this.state.steeringAngle) > STEERING_MAX) {
        this.state.steeringAngle = Math.sign(this.state.steeringAngle) * STEERING_MAX
      }
    } else {
      if (Math.abs(this.state.steeringAngle) > 0) {
        const returnAmt = STEERING_RETURN_RATE * dt
        if (Math.abs(this.state.steeringAngle) <= returnAmt) {
          this.state.steeringAngle = 0
        } else {
          this.state.steeringAngle -= Math.sign(this.state.steeringAngle) * returnAmt
        }
      }
    }

    const speedAbs = Math.abs(this.state.speed)
    const speedRatio = Math.min(speedAbs / MAX_SPEED, 1)
    const turnSpeed = TURN_SPEED_BASE * Math.max(0.3, 1 - speedRatio * 0.8)

    if (this.state.steeringAngle !== 0 && speedAbs > 0.5) {
      this.state.angle += this.state.steeringAngle * turnSpeed * dt
      const drift = this.state.steeringAngle * DRIFT_FACTOR * speedRatio
      this.state.angle += drift * dt
    }

    if (forward > 0) {
      if (this.state.speed < 0) {
        this.state.speed = Math.min(this.state.speed + BRAKE_FORCE * dt, 0)
      } else if (fuel > 0) {
        this.state.speed = Math.min(this.state.speed + ACCELERATION * dt, MAX_SPEED)
      }
    } else if (forward < 0) {
      if (this.state.speed > 0) {
        this.state.speed = Math.max(this.state.speed - BRAKE_FORCE * dt, 0)
      } else if (fuel > 0) {
        this.state.speed = Math.max(this.state.speed - REVERSE_ACCELERATION * dt, -MAX_REVERSE_SPEED)
      }
    } else {
      if (this.state.speed > 0) {
        this.state.speed = Math.max(this.state.speed - FRICTION * dt, 0)
      } else if (this.state.speed < 0) {
        this.state.speed = Math.min(this.state.speed + FRICTION * dt, 0)
      }
    }

    if (speedAbs > 0 && fuel > 0) {
      fuel = Math.max(fuel - this._fuelConsumption * speedRatio * dt, 0)
    }

    const distance = this.state.speed * dt
    const bearing = this.state.angle * 180 / Math.PI
    const moved = destination([currentLng, currentLat], distance, bearing, { units: 'meters' })
    const [lng, lat] = moved.geometry.coordinates

    return { lng, lat, angle: this.state.angle, fuel }
  }

  getSpeed(): number {
    return this.state.speed
  }

  clampSpeed(max: number) {
    if (Math.abs(this.state.speed) > max) {
      this.state.speed = Math.sign(this.state.speed) * max
    }
  }

  setSpeed(speed: number) {
    this.state.speed = speed
  }

  applyOffRoadDrag(dt: number) {
    const drag = FRICTION * dt * 1.5
    if (this.state.speed > 0) {
      this.state.speed = Math.max(this.state.speed - drag, 0)
    } else if (this.state.speed < 0) {
      this.state.speed = Math.min(this.state.speed + drag, 0)
    }
  }

  applyOffRoadSpeedCap(dt: number) {
    const cap = 40 / 3.6
    if (this.state.speed > cap) {
      this.state.speed = Math.max(this.state.speed - BRAKE_FORCE * 0.8 * dt, cap)
    } else if (this.state.speed < -cap) {
      this.state.speed = Math.min(this.state.speed + BRAKE_FORCE * 0.8 * dt, -cap)
    }
  }

  getGear(): string {
    if (this.state.speed > 0.5) return 'D'
    if (this.state.speed < -0.5) return 'R'
    return 'P'
  }
}
