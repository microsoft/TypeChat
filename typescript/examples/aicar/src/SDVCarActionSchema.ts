// The following types define the structure of an object of type CarActions that represents a list of actions you can do on a car.

export interface CarActions {
    actions: (GetTempurature | SetTemperature | GetDoorLockState 
        | SetDoorLockState | GetLightState | SetLightState | SetDoorOpenState 
        | GetTirePressure | GetDoorOpenState | SetTirePressure | UnknownAction)[];
}

//use this when you don't know what the user is asking for
export interface UnknownAction {
    type: 'unknown';
    // text typed by the user that the system did not understand
    command: string;
}

//use this to get the temperature of the car
export interface GetTempurature {
    type: "GetTemperature";
    command: {
        entries: {
            path: "Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature" | "Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature" | "Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature" | "Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature";
        }[];
    };
};

//use this to set the temperature of the car
export interface SetTemperature {
    type: "SetTemperature"
        command: {
            updates: Array<{
                entry: {
                  path: "Vehicle.Cabin.HVAC.Station.Row1.Driver.Temperature" | "Vehicle.Cabin.HVAC.Station.Row2.Driver.Temperature" | "Vehicle.Cabin.HVAC.Station.Row1.Passenger.Temperature" | "Vehicle.Cabin.HVAC.Station.Row2.Passenger.Temperature";
                  value: {int32: number}; //always ensure thie value is set to a number and in the entry object
                }
                fields: string[]
              }>
        }
}

//use this to lock or unlock the doors
export interface SetDoorLockState  {
    type: "SetDoorLockState";
    command: {
        updates: {
            entry: {
                /** which door to lock */
                path: "Vehicle.Cabin.Door.Row1.DriverSide.IsLocked" | "Vehicle.Cabin.Door.Row2.DriverSide.IsLocked" | "Vehicle.Cabin.Door.Row1.PassengerSide.IsLocked" | "Vehicle.Cabin.Door.Row2.PassengerSide.IsLocked" | "Vehicle.Body.Trunk.Rear.IsLocked";
                value: {
                    bool: boolean;
                };
            };
            fields: ("FIELD_VALUE")[];
        }[];
    };
};

//use this to see if the doors or locked or unlocked
export interface GetDoorLockState {
    type: "GetDoorLockState";
    command: {
        entries: {
            path: "Vehicle.Cabin.Door.Row1.DriverSide.IsLocked" | "Vehicle.Cabin.Door.Row2.DriverSide.IsLocked" | "Vehicle.Cabin.Door.Row1.PassengerSide.IsLocked" | "Vehicle.Cabin.Door.Row2.PassengerSide.IsLocked" | "Vehicle.Body.Trunk.Rear.IsLocked";
        }[];
    };
}

//use this to see if the lights are on or off
export interface GetLightState {
    type: "GetLightState";
    command: {
        entries: {
            path: "Vehicle.Body.Lights.Beam.High.IsOn" | "Vehicle.Body.Lights.Beam.Low.IsOn" | "Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling" | "Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling" | "Vehicle.Body.Lights.Fog.Front.IsOn" | "Vehicle.Body.Lights.Fog.Rear.IsOn" | "Vehicle.Body.Lights.Hazard.IsSignaling" | "Vehicle.Body.Lights.Parking.IsOn" | "Vehicle.Body.Lights.Running.IsOn";
        }[];
    };
};

//use this to turn the lights off and on
export interface SetLightState {
    type: "SetLightState";
    command: {
        updates: {
            entry: {
                path: "Vehicle.Body.Lights.Beam.High.IsOn" | "Vehicle.Body.Lights.Beam.Low.IsOn" | "Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling" | "Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling" | "Vehicle.Body.Lights.Fog.Front.IsOn" | "Vehicle.Body.Lights.Fog.Rear.IsOn" | "Vehicle.Body.Lights.Hazard.IsSignaling" | "Vehicle.Body.Lights.Parking.IsOn" | "Vehicle.Body.Lights.Running.IsOn";
                value: {
                    bool: boolean;
                };
            };
            fields: ("FIELD_VALUE")[];
        }[];
    };
};

//use this to get the pressure of the vehicle tires
export interface GetTirePressure {
    type: "GetTirePressure";
    command: {
        /** must be an array of entries */
        entries: {
            path: "Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure" | "Vehicle.Chassis.Axle.Row1.Wheel.Right.Tire.Pressure" | "Vehicle.Chassis.Axle.Row2.Wheel.Left.Tire.Pressure" | "Vehicle.Chassis.Axle.Row2.Wheel.Right.Tire.Pressure";
        }[];
    };
};

//use this to see if the vehicle doors are open or closed
export interface GetDoorOpenState {
    type: "GetDoorOpenState";
    command: {
        entries: {
            path: "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen" | "Vehicle.Cabin.Door.Row2.DriverSide.IsOpen" | "Vehicle.Cabin.Door.Row1.PassengerSide.IsOpen" | "Vehicle.Cabin.Door.Row2.PassengerSide.IsOpen" | "Vehicle.Body.Trunk.Rear.IsOpen";
        }[];
    };
};

//use this to open or close the vehicle doors
export interface SetDoorOpenState {
    type: "SetDoorOpenState";
    command: {
        updates: {
            entry: {
                /** which door to open or close */
                path: "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen" | "Vehicle.Cabin.Door.Row2.DriverSide.IsOpen" | "Vehicle.Cabin.Door.Row1.PassengerSide.IsOpen" | "Vehicle.Cabin.Door.Row2.PassengerSide.IsOpen" | "Vehicle.Body.Trunk.Rear.IsOpen";
                value: {
                    bool: boolean;
                };
            };
            fields: ("FIELD_VALUE")[];
        }[];
    };
};

//use this to set the pressure of the vehicle tires
export interface SetTirePressure {
    type: "SetTirePressure";
    command: {
        updates: {
            entry: {
                path: "Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure" | "Vehicle.Chassis.Axle.Row1.Wheel.Right.Tire.Pressure" | "Vehicle.Chassis.Axle.Row2.Wheel.Left.Tire.Pressure" | "Vehicle.Chassis.Axle.Row2.Wheel.Right.Tire.Pressure";
                value: {uint32: number};
            };
            fields: ['FIELD_VALUE'];
        }[];
    };
};