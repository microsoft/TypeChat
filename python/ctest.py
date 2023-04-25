import openai
import os
import time
import yaml
from pykwalify.core import Core

API_KEY = os.getenv("OPENAI_API_KEY")
RESOURCE_ENDPOINT = os.getenv("OPENAI_API_BASE")

openai.api_type = "azure"
openai.api_key = API_KEY
openai.api_base = RESOURCE_ENDPOINT
openai.api_version = "2022-12-01"
deployment = os.getenv("DEPLOYMENT_NAME")
# Call the Azure OpenAI service here

def tryCompletion():
    for i in range(1, 50):
        try:
            # Create a new completion
            completion = openai.Completion.create(
                engine=deployment,
                prompt="name four vegetables that are fun to eat",
                max_tokens=100
            )

            # Print the completion
            print(completion)
            return(completion)
        except:
            if (i%10 == 0):
                print(f"{i} attempts made.")
            time.sleep(1)
def loadSchema():
    with open('foodOrderSchema.yml', 'r') as file:
        schema = file.read()
        return schema
schemaText = loadSchema()
schema = yaml.safe_load(schemaText)
#print(schema)
with open("example1.yml", "r") as file:
    example1 = yaml.safe_load(file)
print(example1)
c = Core(source_data=example1, schema_data=schema)
c.validate(raise_exception=False)
# tryCompletion()
