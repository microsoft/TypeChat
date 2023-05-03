// Copyright Microsoft Corp
//
// Lightweight  test framework until we pick a real one
//
import { test } from "node:test";

export type TestFunction = (context : TestContext) => void;
export type TestFunctionAsync = (context : TestContext) => Promise<void>;

export class TestFailedException extends Error {
    public constructor(testName? : string) {
        super(testName);
    }
}

export class TestContext {
    public log(obj : any) : void {
        console.log(obj.toString());
    }
    public logError(e : Error) : void  {
        console.log(e);
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
    public logStart(testName : string) : void {
        console.log(`###${testName} Starting###`);            
    }
    public logSuccess(testName : string) : void {
        console.log(`###${testName} Success###`);            
    }
    public logFailed(testName : string, error : Error) : void {
        this.logError(error);
        console.log(`###${testName} Failed###`);
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
            context.logStart(testName);
            test(context);              
            context.logSuccess(testName);            
        }
        catch(e : any) {
            context.logFailed(testName, e);
            if (stopOnError) {
                return;
            }
        }
    }
}    

export async function runTestsAsync(tests : TestFunctionAsync[], stopOnError : boolean) : Promise<void> {
    let context : TestContext = new TestContext();
    for (let i = 0; i < tests.length; ++i) {
        let test : TestFunctionAsync = tests[i];
        let testInfo : any = test;
        let testName : string = testInfo["TestName"];
        if (testName === undefined || testName == "") {
            testName = test.name;
        }
        try {
            context.logStart(testName);
            await test(context);              
            context.logSuccess(testName);            
        }
        catch(e : any) {
            context.logFailed(testName, e);
            if (stopOnError) {
                return;
            }
        }
    }
}    
