// Copyright Microsoft Corp
//
// Lightweight  test framework until we pick a real one
//
import { test } from "node:test";

export type TestFunction = (context : TestContext) => void;

export class TestFailedException extends Error {
    public constructor(testName? : string) {
        super(testName);
    }
}

export class TestContext {
    public log(obj : any) : TestContext {
        console.log(obj.toString());
        return this;
    }
    public logError(e : Error) : TestContext {
        console.log(e);
        return this;
    }
    public assertTrue(result : boolean) : void {
        if (!result) {
            throw new TestFailedException();
        }    
    }
    public assertNotNullOrEmpty(value : string) : void {
        if (value === null || value.length == 0) {
            throw new TestFailedException();
        }
    }
}

export function runTests(tests : TestFunction[], stopOnError : boolean) : void {
    let context : TestContext = new TestContext();
    for (let i = 0; i < tests.length; ++i) {
        let test : TestFunction = tests[i];
        let testInfo : any = test;
        let testName : string = testInfo["TestName"];
        if (testName === undefined || testName == "") {
            testName = test.name;
        }
        try {
            context.log(`###${testName} Starting###`);            
            test(context);              
            console.log(`###${testName} Success###`);            
        }
        catch(e : any) {
            context.logError(e);
            console.log(`###${testName} Failed###`);
            if (stopOnError) {
                return;
            }
        }
    }
}    

