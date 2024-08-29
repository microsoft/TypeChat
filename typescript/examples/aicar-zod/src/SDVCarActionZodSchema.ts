import { z } from "zod";
//import { VAL} from "./gen/kuksa/val/v1/val_connect";
//import path from "path";
//import { EntryRequest } from "./gen/kuksa/val/v1/val_pb";

// """ Here is a list of signals which are used inside the app:
// Door Control: bool
// Vehicle.Cabin.Door.Row1.DriverSide.IsLocked bool
// Vehicle.Cabin.Door.Row1.PassengerSide.IsLocked
// Vehicle.Cabin.Door.Row2.DriverSide.IsLocked
// Vehicle.Cabin.Door.Row2.PassengerSide.IsLocked
// Vehicle.Body.Trunk.Rear.IsLocked
// Vehicle.Cabin.Door.Row1.DriverSide.IsOpen
// Vehicle.Cabin.Door.Row1.PassengerSide.IsOpen
// Vehicle.Cabin.Door.Row2.DriverSide.IsOpen
// Vehicle.Cabin.Door.Row2.PassengerSide.IsOpen
// Vehicle.Body.Trunk.Rear.IsOpen
// Temperature Control: int32
// Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature
// Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature
// Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature
// Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature
// Light Control: bool
// Vehicle.Body.Lights.Beam.High.IsOn
// Vehicle.Body.Lights.Beam.Low.IsOn
// Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling
// Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling
// Vehicle.Body.Lights.Fog.Front.IsOn
// Vehicle.Body.Lights.Fog.Rear.IsOn
// Vehicle.Body.Lights.Hazard.IsSignaling
// Vehicle.Body.Lights.Parking.IsOn
// Vehicle.Body.Lights.Running.IsOn
// Tire Pressure:uint32
// Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure
// Vehicle.Chassis.Axle.Row1.Wheel.Right.Tire.Pressure
// Vehicle.Chassis.Axle.Row2.Wheel.Left.Tire.Pressure
// Vehicle.Chassis.Axle.Row2.Wheel.Right.Tire.Pressure """

export const UnknownText = z.object({
    type: z.literal('unknown'),
    command: z.string().describe("The text that wasn't understood")
});

export const DataEntry = z.object({
    //path: z.enum(['Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature', 'Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature', 'Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature', 'Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature']).describe("The path to the datapoint"),
    path: z.string().describe("The path to the datapoint"),
    value: z.string()
});

//export const GetTemperature = z.instanceof(DataEntry)
export const GetTemperature = z.object({
    type: z.literal('GetTemperature'),
    command: z.object({entries: z.object({path: z.enum(['Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature', 
        'Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature', 
        'Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature', 
        'Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature'])}).array()}),
});

export const GetDoorLockState = z.object({
    type: z.literal('GetDoorLockState'),
    command: z.object({entries: z.object({path: z.enum(['Vehicle.Cabin.Door.Row1.DriverSide.IsLocked', 
        'Vehicle.Cabin.Door.Row2.DriverSide.IsLocked', 
        'Vehicle.Cabin.Door.Row1.PassengerSide.IsLocked', 
        'Vehicle.Cabin.Door.Row2.PassengerSide.IsLocked',
        'Vehicle.Body.Trunk.Rear.IsLocked'])}).array()}),
});
export const SetTemperature = z.object({
    type: z.literal('SetTemperature'),
    command: z.object({updates: z.array(
        z.object({
          entry: z.object({
            path: z.enum(['Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature', 
              'Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature', 
              'Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature', 
              'Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature']),
            value: z.object({ int32: z.number() })
          }),
          fields: z.string().array().nonempty().default(['FIELD_VALUE'])
        })
      )}),
  });

export const SetDoorLockState = z.object({
    type: z.literal('SetDoorLockState'),
    command: z.object({updates: z.array(
        z.object({
          entry: z.object({
            path: z.enum(['Vehicle.Cabin.Door.Row1.DriverSide.IsLocked', 
           'Vehicle.Cabin.Door.Row2.DriverSide.IsLocked', 
           'Vehicle.Cabin.Door.Row1.PassengerSide.IsLocked', 
           'Vehicle.Cabin.Door.Row2.PassengerSide.IsLocked','Vehicle.Body.Trunk.Rear.IsLocked']).describe("which door to lock"),
            value: z.object({ bool: z.boolean() })
          }),
          fields: z.string().array().nonempty().default(['FIELD_VALUE'])
        })
      )}),
  });
  export const GetDoorOpenState = z.object({
    type: z.literal('GetDoorOpenState'),
    command: z.object({entries: z.object({path: z.enum(['Vehicle.Cabin.Door.Row1.DriverSide.IsOpen', 
           'Vehicle.Cabin.Door.Row2.DriverSide.IsOpen', 
           'Vehicle.Cabin.Door.Row1.PassengerSide.IsOpen', 
           'Vehicle.Cabin.Door.Row2.PassengerSide.IsOpen','Vehicle.Body.Trunk.Rear.IsOpen'])}).array()}),
});

  export const SetDoorOpenState = z.object({
    type: z.literal('SetDoorOpenState'),
    command: z.object({updates: z.array(
        z.object({
          entry: z.object({
            path: z.enum(['Vehicle.Cabin.Door.Row1.DriverSide.IsOpen', 
           'Vehicle.Cabin.Door.Row2.DriverSide.IsOpen', 
           'Vehicle.Cabin.Door.Row1.PassengerSide.IsOpen', 
           'Vehicle.Cabin.Door.Row2.PassengerSide.IsOpen','Vehicle.Body.Trunk.Rear.IsOpen']).describe("which door to open or close"),
            value: z.object({ bool: z.boolean() })
          }),
          fields: z.string().array().nonempty().default(['FIELD_VALUE'])
        })
      )}),
  });
  //use to turn the lights off and on
  export const SetLightState = z.object({
    type: z.literal('SetLightState'),
    command: z.object({updates: z.array(
        z.object({
          entry: z.object({
            path: z.enum(['Vehicle.Body.Lights.Beam.High.IsOn', 
                'Vehicle.Body.Lights.Beam.Low.IsOn', 
                'Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling', 
                'Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling', 
                'Vehicle.Body.Lights.Fog.Front.IsOn', 
                'Vehicle.Body.Lights.Fog.Rear.IsOn', 
                'Vehicle.Body.Lights.Hazard.IsSignaling', 
                'Vehicle.Body.Lights.Parking.IsOn', 
                'Vehicle.Body.Lights.Running.IsOn']),
            value: z.object({ bool: z.boolean() })
          }),
          fields: z.string().array().nonempty().default(['FIELD_VALUE'])
        })
      )}),
  });
    //use to get the state of the lights
    export const GetLightState = z.object({
        type: z.literal('GetLightState'),
        command: z.object({entries: z.object({path: z.enum(['Vehicle.Body.Lights.Beam.High.IsOn', 
            'Vehicle.Body.Lights.Beam.Low.IsOn', 
            'Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling', 
            'Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling', 
            'Vehicle.Body.Lights.Fog.Front.IsOn', 
            'Vehicle.Body.Lights.Fog.Rear.IsOn', 
            'Vehicle.Body.Lights.Hazard.IsSignaling', 
            'Vehicle.Body.Lights.Parking.IsOn', 
            'Vehicle.Body.Lights.Running.IsOn'])}).array()}),
    });
    //use to get the pressure of the tires
    export const GetTirePressure = z.object({
        type: z.literal('GetTirePressure'),
        command: z.object({entries: z.object({path: z.enum(['Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure', 
            'Vehicle.Chassis.Axle.Row1.Wheel.Right.Tire.Pressure', 
            'Vehicle.Chassis.Axle.Row2.Wheel.Left.Tire.Pressure', 
            'Vehicle.Chassis.Axle.Row2.Wheel.Right.Tire.Pressure'])}).array().describe('must be an array of entries')}),
    });
    //use to set the pressure of the vehicle tires
    export const SetTirePressure = z.object({
      type: z.literal('SetTirePressure'),
      command: z.object({updates: z.array(
          z.object({
            entry: z.object({
              path: z.enum(['Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure', 
                'Vehicle.Chassis.Axle.Row1.Wheel.Right.Tire.Pressure', 
                'Vehicle.Chassis.Axle.Row2.Wheel.Left.Tire.Pressure', 
                'Vehicle.Chassis.Axle.Row2.Wheel.Right.Tire.Pressure']),
              value: z.object({ uint32: z.number() })
            }),
            fields: z.string().array().nonempty().default(['FIELD_VALUE'])
          })
        )}),
    });

export const SDVCarActions = z.object({
    actions: z.discriminatedUnion("type", [
        GetDoorLockState.describe('Use this to get the state of the door locks'), 
        SetTemperature.describe('Use this to set the temperature'), 
        GetTemperature.describe('Use this to get the temperature'), 
        GetLightState.describe('Use this to get the state of the lights'), 
        SetLightState.describe('Use this to turn the lights off and on'),
        SetDoorLockState.describe('Use this to lock and unlock the doors.  use GetDoorOpenState for opening and closing doors'), 
        GetTirePressure.describe('Use this to get the tire pressure'),   
        GetDoorOpenState.describe('Get the door open state'), 
        SetDoorOpenState.describe('Use this to open and close the doors.  use SetDoorLockState for locking and unlocking doors'),
        SetTirePressure.describe('Use this to set the tire pressure'), 
        UnknownText]).array()
});

export const SDVCarSchema ={
    SDVCarActions: SDVCarActions.describe("The actions to perform on the car"),
    UnknownText: UnknownText.describe("Use this type for order items that match nothing else")
};

