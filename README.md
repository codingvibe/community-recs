# community-recs
A site to ask your community for recommendations

## Stytch
This project was written to both allow a temporary space where community members could submit recommendations and +1 recs they think are good, but also to explore [Stytch](https://stytch.com/). I wanted a way to provide user auth/uniqueness constraints without requiring login, so I used Stytch email magic links. None of the information gathered from Stytch is saved by the server, only by Stytch.

## Back End
The server is written in NodeJS and almost all endpoints are gated by needing to be a known user with a session token in Stytch. This is to try to help reduce spamming.

Also the back end doesn't leverage a datastore, but rather holds community info in memory and returns it. Since this tool is mean to be short lived, having ephemeral storage seemed okay. The back end's default community lifespan is 1 hour as well, in the spirit with keeping things temporary.

## Front End
The front end is strict vanilla Javascript/HTML/CSS. As a result, things get a little hairy when adding elements, but the code is all relatively simple.

It's not...extremely pretty. I'm not a front end developer so if you would like to improve the front end PLEASE DO!