
Large language models (or LLMs) can give us surprisingly rich answers to requests.
Maybe you've tried chatting with a language model and been delighted at how effective it is to brainstorm with it.

> **User:**
>
> It's rainy in Seattle (surprise!). Got 3 quick suggestions for what I should do this weekend? Keep it short and direct.
> 
> **ChatGPT:**
>
> 1. Visit the Seattle Art Museum (SAM) for a day of artistic inspiration and exploration.
> 2. Enjoy a cozy afternoon at a local coffee shop, sipping your favorite brew and diving into a good book.
> 3. Embrace the rainy weather by taking a scenic drive to Snoqualmie Falls and witness the majestic waterfall in all its splendor.

These models are great chat assistants on their own, but can they be used to add natural language interfaces to an application?
The answer as many of us have seen is "yes - sort of", and it really depends on how we ask the model.

Remember, by default these models respond in *natural language* which is how we read and write today;
but traditional programs are kind of bad at working with these answers.
Most software expects to work off of level of structure over bytes, characters, JSON blobs, etc. &mdash; not natural languages like English.
When we don't have structure, we have to parse out what we're interested in, and it might not always be practical.

One way to add some structure and make parsing easier might be to ask for a list of answers:

> **User:**
>
> Provide 3 suggestions for specific places to go to in Seattle on a rainy day.
> Respond in the form of a bulleted list.
> Be succinct.
> 
> **ChatGPT:**
>
> - Seattle Art Museum: Explore the extensive art collection and enjoy the indoor exhibits.
> - Chihuly Garden and Glass: Admire the stunning glass artwork of Dale Chihuly in a covered garden and gallery.
> - Pacific Science Center: Engage in interactive exhibits, planetarium shows, and IMAX films for a day of educational fun.

Maybe a bulleted list is enough to go off of, but how would we break this data up?
Strip the leading bullet points and split on `": "` to separate the venue from its description?
What if a venue has a `": "` in its name?
It turns out that we're still left with problems parsing out natural language.

Now what if we asked the model for a much more structured format like JSON?
As a matter of fact, many language models are great at generating JSON!

> **User:**
> Provide 3 suggestions for specific places to go to in Seattle on a rainy day. Respond in the form of JSON. The JSON should have the following format
> 
> ```json
> [
>     { "venue": "...", "description": "..." },
>     { "venue": "...", "description": "..." }
> ]
> ```

> **ChatGPT:**
> ```json
> [
>     {
>         "venue": "Seattle Art Museum",
>         "description": "The Seattle Art Museum (SAM) is a world-class museum with a diverse collection of art from around the globe. It offers a great indoor activity for a rainy day, allowing you to explore various art exhibitions and displays, including contemporary art, African and Oceanic art, and European painting and sculpture."
>     },
>     {
>         "venue": "Chihuly Garden and Glass",
>         "description": "Chihuly Garden and Glass is an extraordinary exhibition showcasing the breathtaking glass artwork of Dale Chihuly. Located at the Seattle Center, this indoor attraction offers a mesmerizing experience as you wander through vibrant glass sculptures and installations. The beautiful interplay of light and color will captivate your senses, making it a perfect rainy day destination."
>     },
>     {
>         "venue": "Museum of Pop Culture",
>         "description": "The Museum of Pop Culture (MoPOP) is a vibrant museum dedicated to contemporary pop culture, music, science fiction, and more. It features engaging exhibits that celebrate music icons, explore science fiction themes, and delve into the world of video games. Whether you're a fan of music, movies, or pop culture in general, MoPOP offers an immersive and entertaining experience, making it an ideal choice on a rainy day."
>     }
> ]
> ```

Here we asked a model to respond directly with JSON code and provided a sort of "template" or example response to guide its answer.
As you can see, it worked pretty well!

Examples responses are great, but we wondered if there was another approach.
In our case, we asked whether we could simply guide a model with TypeScript types.

> **User:**
> Provide 3 suggestions for specific places to go to in Seattle on a rainy day. Respond strictly with JSON. The JSON should be compatible with the TypeScript type `Response` from the folllowing:
>
> ```ts
> interface Response {
>      data: Array<{ venue: string, description: string }>;
> }
> ```
>
> **ChatGPT:**
> ```json
> {
>   "data": [
>     {
>       "venue": "Museum of Pop Culture",
>       "description": "Explore the fascinating world of popular culture through interactive exhibits, music memorabilia, and multimedia displays at the Museum of Pop Culture."
>     },
>     {
>       "venue": "Seattle Art Museum",
>       "description": "Indulge in the diverse collection of artworks from around the world at the Seattle Art Museum, featuring both contemporary and classical pieces."
>     },
>     {
>       "venue": "Pike Place Market",
>       "description": "Enjoy the vibrant atmosphere of Pike Place Market, where you can wander through covered stalls offering fresh produce, crafts, and delicious food from local vendors."
>     }
>   ]
> }
> ```

This works fairly well!
And despite being conceptually simple, it's a very powerful way to bridge the gap between natural language and something our applications can work with.
But we wanted to make it as easy as possible to use this pattern, and brush away some of the sharp edges of language model responses.

This is the key idea behind TypeChat.
By just giving a model with a schema (some types) and a request, we can integrate natural language into an application and work through well-typed structured data.

TODO