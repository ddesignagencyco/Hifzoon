/**
 * The public landing page served at the API root (`/`).
 *
 * It exists so `https://hifzoon-api.onrender.com/` answers with something deliberate
 * instead of a Nest 404: a branded, self-contained status page proving the API is live.
 * The stylesheet, script and favicon are inline, so the only external requests are the
 * three Google Font files the web app already uses (Fraunces, Plus Jakarta Sans, Amiri).
 */

export const LANDING_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export interface LandingPageOptions {
  /** Public origin of the Next.js app, when it is not a local development URL. */
  webUrl?: string;
  /** Where Swagger UI is mounted. */
  apiDocsUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPublicUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value);
}

export function renderLandingPage(options: LandingPageOptions): string {
  const docs = escapeHtml(options.apiDocsUrl);
  const webUrl = isPublicUrl(options.webUrl) ? escapeHtml(options.webUrl) : null;
  const primaryHref = webUrl ?? docs;
  const primaryLabel = webUrl ? 'Open Hifzoon' : 'Explore the API';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0a1f19" />
    <title>Hifzoon — Live and running</title>
    <meta
      name="description"
      content="The Hifzoon platform is online: live Quran classes, a synchronized Mushaf and progress reports families can trust."
    />
    <link
      rel="icon"
      href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNjQgNjQiPjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE0IiBmaWxsPSIjZmFmN2YxIi8+PGltYWdlIHg9IjYiIHk9IjYiIHdpZHRoPSI1MiIgaGVpZ2h0PSI1MiIgeGxpbms6aHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFHQUFBQUJnQ0FNQUFBRFZSb2NLQUFBREFGQk1WRVZNYVhFQVV3QUFTakFBU2pDc3N3QUFTekFBZnhJQUFBQUFWRlVBUHprQlN6RFRhUUMxckJNQlN6RUJTVEFCU1M4SEFBQUJTaThCU2pBQlNpOEJTekVCVERFQ1NTc0FRU2tCVERBQlNUQUNTUzhBUnpFQlN6QUJUVElCU1MvL0FBQUFTQys1Znk4QlNTKzNoaVlCU3pBQVNDNEJTekFCU2pBQlN6QUJTaThCU1M4QlNTOEFTUzhDU2k4QVJ5NEJTekVCU3pFQVNTOEFTUzhCU2pBQlNqQUFRVEFCVFRFQVNTOEFSeThKU2k0QVNqQUJTVEMxaFNVQVJ5NEJTakFBUml3QVNUQUNTaThCVERFQlNqQUFTREFCU1M4QVN6QUFSeTRBU2k4QlNUQUFTQyszaGlNQlRERUFTUzhCU2pDM2hpTUFTVEFCU2k4QVJDOEFTUyszaHlZQlNqQzZpU1lBU1M4QlNTOEFTUzhCU1M4QlN6QzJoQ01BUkM4QlN6Q3hmU2F6aENJQlNqQUFTakFCU2pBQVNUQUJUREVDU3pBQVJ6QzFoaVVDVERFQ1NpOEJTakFBUlRFQVNUQUFTQzRCU2pDMmhTVURTekFBVGl1eGdoOEFTUzhCU3pBQ1RURUFSakFCU2pBQU9ESUJTUys2aUNVQ1N6QUFTakFCU3pDNmlDVUJTakMyaGlTMmhTT29oaUM1aHlZQlNUQzRoeVcyaFNTMmhpUUJTakFCU2k4QVNUQzFoU1c1aHlhMmhpU3poQ01CU3pBQVNqQzNpaUc0aHlhNGh5VzZpQ1FBU1MremhDUzdpQ1czaGlVQVNTOENTUysyaFNTMmhpVmJZU3EyaGlRQlN6QUJTeSt6aENTMWhTUUJUREc2aHlTMGhDUzFoU1cxaENTNmlTYTZpU1lCU2krMmhDTzhpU1cyaGlTemhDVzFoQ1MzaGlTMGhDTzBoU1FCVERFRVVEUHBtaUQvL3hXNmh5YTlpeWYvdWhtNWlDVzJoaVMyaFNTNWlTYkZqQ08yaGlYYmlSdTNoaVN6Z3lTNWlTWUNVRFBqbVNEMW5CKzhpeWE0aGlYaGt5RzlpQ1c5aXlheGd5U3loQ08raXllMWhTTUFNelc0aGlhbGZTVVJUaThrVXl5WWV5ZkVpaVhCalNmZmp4L0ppeVRCamlmUWppSW1XVE1VVGk0QlR6TUJUVElCVGpNQlN6RUJVRFFCVERJQVNqQUJUREVCVWpVQlRUTUJUaklCVVRRQlVUWEJqU2kyaGlhOGlpY0FTQysvaXllNmlDZTRoeWE5aXlmQWpTZkNqaWdDVlRmTmxTblBtQ3ZJa2luSmxDbTNoU1FCVFRIRmtDZ0ZUREIwYnlwRW0zVTFBQUFBMzNSU1RsTUFBL3orQWY0Q0FRTUUrd0lEL1AzOEF2cUQrLzMrQmdmNytUOFordjVUQVJRRTR2M3dPZjFlUXMzUThsQnNDdm5STEZ6VTlnWDhqeVlPcFluN0tOZ1NNR0g0aGpMNkhrSzErRmtwN1poRUxwMndJSlQ3NnVkSTV6emt3UmdidkFVZHc2cDVtK2loTnY3emZXMGtGaUxiL1dvTUVnL2t5YkZMRU94amdjbG1pN2h6SXdmNjN0aGNpNnpkZEVEaVdjbU9jQXp5VEpSVm0zWEVpMlBtOWdmNS9NWkp1T0ZTZ2UvcTlyQjcwb0t2b21yZk05MzIvQ1VGbzZnTHk3dHQvVjE2Q1dVODdmNFpFa1BUSFc3OGswVHRjQlk0VzlwaSs3THpNR2owUWhReEtpK1RaZ0FBQUFsd1NGbHpBQUFMRWdBQUN4SUIwdDErL0FBQUR6TkpSRUZVYU42MVdnbFlrMWZXUG53aCtaSkFFa0lTSUJBMkNTQkxXV1FURUJBRVJmWk5SQkVWQlJSRVFWVEdCZHpydnEvalZ0eHR0YTUxYVcxclcxdTdkNmFkK2ZmdFcvSWxKSUFMcTlwbDVyODNpZi84ejZoUXArUjdlQjZ5M0h2ZSs1NzNuSHZQdlRjQXYvNXhnTFdienM0RWI3RFJZdzlyMW0veUJkTGVadmEvZTN3UkhPMkJ0STE5WC9qd3gvZG5rSTdlNjdZNU9qb012MzBIbUZuYS95SDQyc08wUTR2QUJsNXloRFZkYmZrQTJkdldkSDk4WnBzdEdKenFlM01tQXRqWmMrekIrOW5Eem9FRTM3Y2ZuRnVMaUV4Nzg1ZlBac0t3aTRBQmVucE93Z3o0dzlFckcxYUFMem44THZxZ3UvZGRESkFQTS9jTlB3TXM4cU8yN2pQZzYrczl3NEdFdGNPZTBDZzhTM3RLOXU3QWFXWVBKdyt1Ry9aODg0V052ZXZiZWo2NCsrbW5HMC90dldZREp6bkFsV09QZnVwOTFOdjF1UFJURzlqSE1tUmZQdHJXZUd6RDJVVTJzWTg1d0o1M0RzN2NBL2Eyc1k4UWZPSHROVGlRYkxjaXpIenpJTmhxK0lBaWY4Yk83dDRQa1JnMkk3Q290TEYvdiswQVVDNnM2VDI2MW9ZK0FuaTMrOWcrMndFNHdPZi85dWpwZTdaekVRbkNmLzNydjN4a1F4ZkZ3RC8vNVovaXdjbFc5a1hnSGlKbEMxMUFZRFA3T2F4TVRtMTJCVHRiQ0NDRXBUbXNRaUdUTTVtTFFUanM5Z1VDV0tnSmtNbTRBSVFRTkJwRXc3emVDTUUxbHhZcjVIUmNNQ2VYbTNKQ3dXNDRwU1pGTUxxUzBoQnFKaGZTSnhrVVlwVWswWFVZM1NSd2dsRTVadnRWQ01xL210WW9OZFNKSkJBNkRaZTZpMnQrbHJoSjNFeUhRVURhd2RndGxDWkFRMnRUc1RDLy9YRVNnbnVEU1U2NGVYcnVSdllCaGVqNFZrb3VGVXVZaE9HSUppRUk2OElOY3FtY3lWbUtNc0h5VWZ3czVMQUFEUlUxQit6STMycS9JdE9va0VubHBvaWsveHV1RXdrdG5GSVRFRTVmUHdKQzhyY2w3NVFSdEZwR2lKbUVlSXQ5SjJ3UENSR2FRMmNvTlJJbWpyUjMraTMyczZKWk5VOXVpSjRIVG1aQlNaSjhGcmV0VExoU0VxN2IzUFNQVDM1MnNKSlBLSGdaeGkxVHJKNFF3Skh4bHByUkRwb1NHSTBFSVV4ZjlvOVdrY2krUVNianErbnlDcXY3QlJDcHFyTktiU2VBRnRxTjRJZnJWcnUrSWdMNVROOVFxVXdtVmRNRkx0YlpreVJGNVNadCtyTjNRamdTS3lFOHczVTFyK1lrRjFkTHFFRFNKTDJNcDZiamdIUjZaakhPbUdhSThMR3VCMGlJckhDSlJKV21tMmRsR09QNmE0WmZuNGNOa0dBM25aYnpNK2hjYzNaWjdGOHdTUnBxbWRWaHoxWWNFUnloQ1pYRVV4dHA2UkxwUC9SYUpJQUpjWGc4UXBqSHFQbGlPdFBKeVdJZlJWRUxSMGVsVk5GMFp2eXpsTENERnNaTkpXWTJZNzhLSVhYcjBLa3RoTm10cURVSlBpUDBCTUdlcnJENlZ3Z3h1UWJEa2tob1drMXpyZlhXOVlBa25hWXpZaW1objRDd2hKQ2JPZlJhSjRMZDVlYkdXK2tNbm9JYlpZa1o1Sjc2Y3ByZUVvbmV4bWN5ZEhXb2RZNFFRUHAxSGlFM3prS3ZSQkEzeXhwaWcwaEFRbUhJQW1UZkpjSW9GdE9WMXJ3U1F0WnlBMTArSG4zaEJESEZ0RXFWR0dPaFpnZFZSckZTcnkzQ2ExTHI2ejVEaVVBNlZSblk0UEVBN2l4QlNJd0h6RDRsU2J0ZHRLZHFsMldOSVFXUXFxV1oxU2xtQkFITWtmS1VHdU5LRUlRVmNseGx5bEE1VVVBcDVGeFVCU1NheEdMRGxuamNuQVJSQW1WYUVvb1hIbTl2ZTh3bnFkWEVOTSszMmpwaEVDdU1tOEgxZDdRaXczZ2lmakFFSVV3MnlhVzhpVlFjbE5OaURWVmcxa3dBY1JUWFhQVC81azBoaENXWXFPa3VsdGdaeDhnSnJnR09HQ2Z5ZU9HNjJZTUZrZ2cxUnEza2JHWEtWRU9BbkZtSk5ST0NGODAxcCtCKzNyQW9leVkrcGtBS0k0UTZTeng3R1JWU3ZUWWwxNURCNDR1WnpNRUJabE55bHBVWk00c3lXS1ZNNzQ0YUl3YzFVOVdqemQxODRlU2E3ODJscVFEaUk1aXlDdlF0aWlNWlQ4clRGeVZTQ2g0cnBoSUdBM0NDK2pKNTlNUm8vZElrdlZUSlU0OUczZTFnSkorNllBay9SOWovL1NYTEZsd0VYZ1o2cFRtcUZtZ05BUVEzTmpKYUhSMGRyWjR3V0NxUWtMUTFjWnp6T09kSWYxNkFsQmRkaExvanQxSFZGV2FqM3JEbjZ0MnJsajB5Q2E1UkZJNStKeGlmdzBwbHJQK0N1c09vNzRVNWc4OFRjUVp0U0VqSXc0UjBLVCtBbDRHbkdKUVluWm1XeUhDRWZYMDd6bjFuMlI4SW9VQVhKTUpCRzNtZEphVDZwRVI5U0cySVZqOXJzS25WRGlhd1BKVkJ4aDN3RWZNbEJCZUtJMGZZM0Y1czhhc0RuUDlseDlHamxoTTFOS2ZvWGs4eGw2eEdndENIekovejhDSERLSXhlZzJtQUFQU0d6ZVAwaGl3NFRVczAxQzRNNEJMUjdteVd3QUh5MytyZWNiWC9ycG1DQ09icFJ2aGdnRjJVV2t3M2dQdEROamVYdGVibUlBRGFCWENDR2dXektMR0VYdUtCZk9RU2JBVkFFdmZkMzNpMTczMnp6Q0o0RFFPZ3NxT2FSWk5SQXNyOTE1dGNHNWdoR0xpelV4ZERJUUlJTmFaSk5Fd1ZzdU1TMFdrR2NJRHN2ZmNSUUUvZkNrd0JBWFFnZ0Jpb1ljSUpPVGNaZFcyTmdTQXFkQ2lBTWdzQWJHNlhjRXA2TmxyaGdqdXNBTzkyamVuWnNiMzd3VmQ3VUVDWkFlWUQxREVTOW5oN0FwNjlnakhBMEF6aUlaUEtBcWVtM0xKSldnMjNTeEJqWWVBTFgzN3IxOWl6Y1h0M1NkL0hpSUxWUmNXME9HZFNXWEVZaWJvR0NTRjRLQVlUMklsUndWbzZFTUEvdFNWeFhCU3JIQXRSSFMwZzhvWjE3L2UyK1NFWGRaZDAvekViSExESVU1dVNUR3pFdU1TNlFIL0U0R0ZJY0hESTBGRWtNOUJpRERDN1EweHZpV01uSWdBc3NnTmM3R3J6SzNuMFVXbTMzNWhINXkwaUl3QVpYWnpNYURvdklBQzlsR1UxUTRrODBrQVFoSVpEQUhQVUdmb1IvbVg2U0FUUUFtL0F5ZlgzL2Z3ZUhGcjc3b05HdjVLK05laVQxM1JMbWthemsvd2JXUFZEZHpPQUFtMkJCZ1VRSW9BQVBsK01BZng1TXYzeStBTjhDNE0zNEdML21CSXNMNXpxWFYvUzlaNEZJQ3pTY0NDc2pGVThuSUFCQ0NsUHpnM0ZnTVVBUmd5Z0o5aEpIaEJhRHpqUlhOQ2hJMUwzUFZnSG03clczN256SndTd3NITkVVOUVCWEIwb01BTnoxd3h1cUVSanBYaFNOek1nREpQK2xtaU9zQW9GNmJsOG1MYmh3ZnIrODFqa2hiclRPTkY4UnJCbUFIY01JS2VIQU1oRHhaelZSUThKZHJrSFRyVGd6aFlzY3Y2eCs0M2RwWmV1SWcwZTdBTkhMUEpwbkdncENFQ1BHZWhsL0FBMU42UUdCSituTUdBQU5BVXZ0ekRBQUNpMVBuZzBwdkZPWHplUytxdFB3TnVjQi9QUm1IeW1HaFQ2a1dZTmVLaVMvVlVBTEk0aUtSTFpBb0R6QUNYYU4xMWovUHpHK04xdjYxcGxTYlFPQzhBU1RzeE9NRFBnOFRMbzBNRUI4dGh3aFV4dFppQlQ2SzBhbUtjSzVDTy9Sci9HeHJuMy9YcS9SSEFJb0JObE1nYWd4U3htd0pPTEZSUFowTUhYNU1tVUowUEZ0cWNpQUlOQ1dXWUdpR2pIRE96aGt3M2RDS0J4YmsvcE5QUU9pMndCR0lFcXdEekVnR0lZSnJiOXdNdUxPeUVxb3oyeVJxYW5UL0ZhQURCV3kzWG1WUHdOQUEzNlVsZUozLzI1WXg0Y3dpZnYxcmtJTTlEeG85RlU0ZUUxQlhYTlFqc2c4cVVjWE9ZdmlIU2Z2SFN5KzV6UktZS1l5SVUxVmdiT0ZvQk5hREx5YTJ6cnZZeFhaU3VBQUh3SzVvMTFnZmp4WS8xUno1RmpSM3U0dm1TOUR6dThPbmk1Z3FNUlVTT25tSHFpSUhDQkhTNGJYU04wWmdCMGcvRGp0MzJQSG4zN2VKVjFQY0JSaEV0Umo2emM4dFBSTEcxaUdCTW4xU2F2TG41QkFZbDJwb2M3cEN4ZktzYlBjVDVINlhUSzVPS1JNWWpCZ0JuQUhyS3ZyRmh4OSs2S2IvS3REQVp3b3ZrblJtaDBPaDM5czFKQ2lNV0VWS29uT290ZnVEOUh4Um85RVNVakQvOHBKYkVhdHdBajVSazhiOW40OG5ISW5BQkNLMzluZVNwUnBZdGlaWGZyNktiVUV4S0dVYmxwM0NSSzFBMTE1U3ZWZENINWd2cDBma1dTUzN3RW5XRUc0UE5WS2hWZnBaU2duYmF1ZW5kVEU0bXIvMTBETis2MXQ3ZDMzQmlZaGN3THlMQ3cxQkVVZzNialN0UVlkZUh4TUFMQkpmdllKWTMzK0h1QTBCeGVIS1JyOWNkVmFQU0V4RTFNSE1jZEE5dzBudTJuQTUwdzUvbFpnWUdqVWxOSGpRcEVrWUxLRGEva0RrK3hteEozRUJNU0NVRklFWDhsNy9vVWNKWkZaejFId1ZuSExZUlVPbHdqNGY5TTQ0ZmpWQkkzTkx6WWNLWnpOYXBOaFhCNFMydFFSRkJRRk5xMm9pT1hRZ3B0eE5GZVA1emdzNXpSWk9KK052QUp1WnArRGJLVXVyZ1hLRkRURVRJRjRqcGpPWFZaY2xCcmMxRHkxR2lhMHBsVTRiR3hzVHB0SVBKS2VVY3NSVEdlVklPclBZUldkOFM2dVlYempSUmpkSnZVRU56YUdweGNwdVppZFFYb1RLeHo4L1BWM2JvOVRaVWR5Zk5keDIwZE9kb2ozbFVvY28zM3FCKzVNRGNvbXRKNWhxZkZVcmt4VUVtbFNTVEh3N21HSmxTdmVxYWxlVktVSnFwbTkrU2tpbVd1TVNMWHhSNUpJN2NlWGh3ZjFObTgrSk0zbmp1Ni8vTVg0N2ZvQ2tWL3J6KzVZR1ZtYlFlbFNkTk5iMHJQb2QxVXg1WFhKOE9zenJRMFJwZFdQaS95K1ZJNlFYZTYvdmFmWnp6MytiV0RNS1ZXbHdoSmVZR3pEeGRYMVJRVU8rOGVsUmZaaEJBclpqZm9QS09wNXFZcHRVb2tweGVaMlhrOXR2MjBjejFPejhpOFVWdWRpNnNLcW9vVHQ2TDJjSUc1bmdmZmJYdkIxY0NteTVES1JDZHJWUlJ5TkVOUk92UlBGZkw2OU1UUWVCQUZOdWpTbUJOMkJ6aTFhVGRrNnRMYWw4eHpoYkRKenBsYlF2aW9LVzZMNHNMRTB5YlhNZ3ZoNE1IblQraEpXTGRoRXlTMjMwTnRQYS9YYXJXMTE5MDRodEoxZG5iU2t6YUgycEd2NVRDNlFuQWVLSUFxM2IzYTJTNlFWN09FdzJtQjVnZE5yVFluUnhzaVkybm1YdnN1K0hqN2k2NjBmV0ZiMzEyb2EwbGQ2aisydnFpaW9xSW9LVDB2c0s2bXN0clVQa0ExTExSYm5FQjExb21xVWxaMlVvVWVjQ1JLTjlETzVEVFgxQVhtamEyditNSG5CNCtpeURtVEExdWNZVWYvbVJkZU1hRGl1ZitrZWZkeTYvWVhuMy85OWVkZjNEWTNjMG5mdWxyYjNyNGxGTHlxTy9JZ3ZiWTJGZktTQndacXA4K2VZNTQ0YjkzKy9PdWIyVGUvL3VJVGUxekIvcUgzdlJmZk1LQXJvTzE3eng0OHRmT2RONCsxdGMyZE8rYllzYU1iRGwzYXRPTGZiOEd5ck9rM0JncWI1Z2NsdTVTZlh1QXlhK0JHWmVBeXVIWHpvMVdYVVBPMnVUMDlQWGZ1dEoxN1orZXB5MmRMWDNxZjdRaG4rcDQrZnZ5MHY3ZTdCeTIralg3ZHZmMVBueno1c2YvY29kL2ZoS0s0RzFwM3FHbmRISk5lZmErcUhtNSs4OEc1dmgrZlBIbmExMTF5Yk8rNXZYdmZLdW51K3dWMS8rWEtTKzlndkdIL29mMW5QOXk0Yjl1MS9PenM3UHhyMi9adFhMUHEvSWEzZm56UzlmWi8zRjZXKzVkUmNFUzAxRFBoQjhlUGR2WStmcnArdy9sVjMrLzRNbi90dEdtTHBrMmJtZjBuMUh6VHFjdStnOTNFdmZCeWErMlpWVzkzUGRsNzhWWlN1UmNzYlo1ai8vdlBublI5dGYvTTJobXZZTVg2SGVtTEhrZGZCOHVEWHZrNm1nTnVSdjdGN1U4K095Tk0vWjhqWWYrMS9VbnBwbXRtNC9hNHVZT0RQWDVRZTNOejcxYytneVFkSExGVDkxejVZKytuOE45b0ovaWZheGFocFhTWWZ4L2lpMER1UHYxczU2R2RwWS9SQnNmUllmaC80V0x2NlAzOTBaOGFmenA2ZG9iREs0ejlmd0g4UFdETVZGa3pod0FBQUFCSlJVNUVya0pnZ2c9PSIgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFHQUFBQUJnQ0FNQUFBRFZSb2NLQUFBREFGQk1WRVZNYVhFQVV3QUFTakFBU2pDc3N3QUFTekFBZnhJQUFBQUFWRlVBUHprQlN6RFRhUUMxckJNQlN6RUJTVEFCU1M4SEFBQUJTaThCU2pBQlNpOEJTekVCVERFQ1NTc0FRU2tCVERBQlNUQUNTUzhBUnpFQlN6QUJUVElCU1MvL0FBQUFTQys1Znk4QlNTKzNoaVlCU3pBQVNDNEJTekFCU2pBQlN6QUJTaThCU1M4QlNTOEFTUzhDU2k4QVJ5NEJTekVCU3pFQVNTOEFTUzhCU2pBQlNqQUFRVEFCVFRFQVNTOEFSeThKU2k0QVNqQUJTVEMxaFNVQVJ5NEJTakFBUml3QVNUQUNTaThCVERFQlNqQUFTREFCU1M4QVN6QUFSeTRBU2k4QlNUQUFTQyszaGlNQlRERUFTUzhCU2pDM2hpTUFTVEFCU2k4QVJDOEFTUyszaHlZQlNqQzZpU1lBU1M4QlNTOEFTUzhCU1M4QlN6QzJoQ01BUkM4QlN6Q3hmU2F6aENJQlNqQUFTakFCU2pBQVNUQUJUREVDU3pBQVJ6QzFoaVVDVERFQ1NpOEJTakFBUlRFQVNUQUFTQzRCU2pDMmhTVURTekFBVGl1eGdoOEFTUzhCU3pBQ1RURUFSakFCU2pBQU9ESUJTUys2aUNVQ1N6QUFTakFCU3pDNmlDVUJTakMyaGlTMmhTT29oaUM1aHlZQlNUQzRoeVcyaFNTMmhpUUJTakFCU2k4QVNUQzFoU1c1aHlhMmhpU3poQ01CU3pBQVNqQzNpaUc0aHlhNGh5VzZpQ1FBU1MremhDUzdpQ1czaGlVQVNTOENTUysyaFNTMmhpVmJZU3EyaGlRQlN6QUJTeSt6aENTMWhTUUJUREc2aHlTMGhDUzFoU1cxaENTNmlTYTZpU1lCU2krMmhDTzhpU1cyaGlTemhDVzFoQ1MzaGlTMGhDTzBoU1FCVERFRVVEUHBtaUQvL3hXNmh5YTlpeWYvdWhtNWlDVzJoaVMyaFNTNWlTYkZqQ08yaGlYYmlSdTNoaVN6Z3lTNWlTWUNVRFBqbVNEMW5CKzhpeWE0aGlYaGt5RzlpQ1c5aXlheGd5U3loQ08raXllMWhTTUFNelc0aGlhbGZTVVJUaThrVXl5WWV5ZkVpaVhCalNmZmp4L0ppeVRCamlmUWppSW1XVE1VVGk0QlR6TUJUVElCVGpNQlN6RUJVRFFCVERJQVNqQUJUREVCVWpVQlRUTUJUaklCVVRRQlVUWEJqU2kyaGlhOGlpY0FTQysvaXllNmlDZTRoeWE5aXlmQWpTZkNqaWdDVlRmTmxTblBtQ3ZJa2luSmxDbTNoU1FCVFRIRmtDZ0ZUREIwYnlwRW0zVTFBQUFBMzNSU1RsTUFBL3orQWY0Q0FRTUUrd0lEL1AzOEF2cUQrLzMrQmdmNytUOFordjVUQVJRRTR2M3dPZjFlUXMzUThsQnNDdm5STEZ6VTlnWDhqeVlPcFluN0tOZ1NNR0g0aGpMNkhrSzErRmtwN1poRUxwMndJSlQ3NnVkSTV6emt3UmdidkFVZHc2cDVtK2loTnY3emZXMGtGaUxiL1dvTUVnL2t5YkZMRU94amdjbG1pN2h6SXdmNjN0aGNpNnpkZEVEaVdjbU9jQXp5VEpSVm0zWEVpMlBtOWdmNS9NWkp1T0ZTZ2UvcTlyQjcwb0t2b21yZk05MzIvQ1VGbzZnTHk3dHQvVjE2Q1dVODdmNFpFa1BUSFc3OGswVHRjQlk0VzlwaSs3THpNR2owUWhReEtpK1RaZ0FBQUFsd1NGbHpBQUFMRWdBQUN4SUIwdDErL0FBQUR6TkpSRUZVYU42MVdnbFlrMWZXUG53aCtaSkFFa0lTSUJBMkNTQkxXV1FURUJBRVJmWk5SQkVWQlJSRVFWVEdCZHpydnEvalZ0eHR0YTUxYVcxclcxdTdkNmFkK2ZmdFcvSWxKSUFMcTlwbDVyODNpZi84ejZoUXArUjdlQjZ5M0h2ZSs1NzNuSHZQdlRjQXYvNXhnTFdienM0RWI3RFJZdzlyMW0veUJkTGVadmEvZTN3UkhPMkJ0STE5WC9qd3gvZG5rSTdlNjdZNU9qb012MzBIbUZuYS95SDQyc08wUTR2QUJsNXloRFZkYmZrQTJkdldkSDk4WnBzdEdKenFlM01tQXRqWmMrekIrOW5Eem9FRTM3Y2ZuRnVMaUV4Nzg1ZlBac0t3aTRBQmVucE93Z3o0dzlFckcxYUFMem44THZxZ3UvZGRESkFQTS9jTlB3TXM4cU8yN2pQZzYrczl3NEdFdGNPZTBDZzhTM3RLOXU3QWFXWVBKdyt1Ry9aODg0V052ZXZiZWo2NCsrbW5HMC90dldZREp6bkFsV09QZnVwOTFOdjF1UFJURzlqSE1tUmZQdHJXZUd6RDJVVTJzWTg1d0o1M0RzN2NBL2Eyc1k4UWZPSHROVGlRYkxjaXpIenpJTmhxK0lBaWY4Yk83dDRQa1JnMkk3Q290TEYvdiswQVVDNnM2VDI2MW9ZK0FuaTMrOWcrMndFNHdPZi85dWpwZTdaekVRbkNmLzNydjN4a1F4ZkZ3RC8vNVovaXdjbFc5a1hnSGlKbEMxMUFZRFA3T2F4TVRtMTJCVHRiQ0NDRXBUbXNRaUdUTTVtTFFUanM5Z1VDV0tnSmtNbTRBSVFRTkJwRXc3emVDTUUxbHhZcjVIUmNNQ2VYbTNKQ3dXNDRwU1pGTUxxUzBoQnFKaGZTSnhrVVlwVWswWFVZM1NSd2dsRTVadnRWQ01xL210WW9OZFNKSkJBNkRaZTZpMnQrbHJoSjNFeUhRVURhd2RndGxDWkFRMnRUc1RDLy9YRVNnbnVEU1U2NGVYcnVSdllCaGVqNFZrb3VGVXVZaE9HSUppRUk2OElOY3FtY3lWbUtNc0h5VWZ3czVMQUFEUlUxQit6STMycS9JdE9va0VubHBvaWsveHV1RXdrdG5GSVRFRTVmUHdKQzhyY2w3NVFSdEZwR2lKbUVlSXQ5SjJ3UENSR2FRMmNvTlJJbWpyUjMraTMyczZKWk5VOXVpSjRIVG1aQlNaSjhGcmV0VExoU0VxN2IzUFNQVDM1MnNKSlBLSGdaeGkxVHJKNFF3Skh4bHByUkRwb1NHSTBFSVV4ZjlvOVdrY2krUVNianErbnlDcXY3QlJDcHFyTktiU2VBRnRxTjRJZnJWcnUrSWdMNVROOVFxVXdtVmRNRkx0YlpreVJGNVNadCtyTjNRamdTS3lFOHczVTFyK1lrRjFkTHFFRFNKTDJNcDZiamdIUjZaakhPbUdhSThMR3VCMGlJckhDSlJKV21tMmRsR09QNmE0WmZuNGNOa0dBM25aYnpNK2hjYzNaWjdGOHdTUnBxbWRWaHoxWWNFUnloQ1pYRVV4dHA2UkxwUC9SYUpJQUpjWGc4UXBqSHFQbGlPdFBKeVdJZlJWRUxSMGVsVk5GMFp2eXpsTENERnNaTkpXWTJZNzhLSVhYcjBLa3RoTm10cURVSlBpUDBCTUdlcnJENlZ3Z3h1UWJEa2tob1drMXpyZlhXOVlBa25hWXpZaW1objRDd2hKQ2JPZlJhSjRMZDVlYkdXK2tNbm9JYlpZa1o1Sjc2Y3ByZUVvbmV4bWN5ZEhXb2RZNFFRUHAxSGlFM3prS3ZSQkEzeXhwaWcwaEFRbUhJQW1UZkpjSW9GdE9WMXJ3U1F0WnlBMTArSG4zaEJESEZ0RXFWR0dPaFpnZFZSckZTcnkzQ2ExTHI2ejVEaVVBNlZSblk0UEVBN2l4QlNJd0h6RDRsU2J0ZHRLZHFsMldOSVFXUXFxV1oxU2xtQkFITWtmS1VHdU5LRUlRVmNseGx5bEE1VVVBcDVGeFVCU1NheEdMRGxuamNuQVJSQW1WYUVvb1hIbTl2ZTh3bnFkWEVOTSszMmpwaEVDdU1tOEgxZDdRaXczZ2lmakFFSVV3MnlhVzhpVlFjbE5OaURWVmcxa3dBY1JUWFhQVC81azBoaENXWXFPa3VsdGdaeDhnSnJnR09HQ2Z5ZU9HNjJZTUZrZ2cxUnEza2JHWEtWRU9BbkZtSk5ST0NGODAxcCtCKzNyQW9leVkrcGtBS0k0UTZTeng3R1JWU3ZUWWwxNURCNDR1WnpNRUJabE55bHBVWk00c3lXS1ZNNzQ0YUl3YzFVOVdqemQxODRlU2E3ODJscVFEaUk1aXlDdlF0aWlNWlQ4clRGeVZTQ2g0cnBoSUdBM0NDK2pKNTlNUm8vZElrdlZUSlU0OUczZTFnSkorNllBay9SOWovL1NYTEZsd0VYZ1o2cFRtcUZtZ05BUVEzTmpKYUhSMGRyWjR3V0NxUWtMUTFjWnp6T09kSWYxNkFsQmRkaExvanQxSFZGV2FqM3JEbjZ0MnJsajB5Q2E1UkZJNStKeGlmdzBwbHJQK0N1c09vNzRVNWc4OFRjUVp0U0VqSXc0UjBLVCtBbDRHbkdKUVluWm1XeUhDRWZYMDd6bjFuMlI4SW9VQVhKTUpCRzNtZEphVDZwRVI5U0cySVZqOXJzS25WRGlhd1BKVkJ4aDN3RWZNbEJCZUtJMGZZM0Y1czhhc0RuUDlseDlHamxoTTFOS2ZvWGs4eGw2eEdndENIekovejhDSERLSXhlZzJtQUFQU0d6ZVAwaGl3NFRVczAxQzRNNEJMUjdteVd3QUh5MytyZWNiWC9ycG1DQ09icFJ2aGdnRjJVV2t3M2dQdEROamVYdGVibUlBRGFCWENDR2dXektMR0VYdUtCZk9RU2JBVkFFdmZkMzNpMTczMnp6Q0o0RFFPZ3NxT2FSWk5SQXNyOTE1dGNHNWdoR0xpelV4ZERJUUlJTmFaSk5Fd1ZzdU1TMFdrR2NJRHN2ZmNSUUUvZkNrd0JBWFFnZ0Jpb1ljSUpPVGNaZFcyTmdTQXFkQ2lBTWdzQWJHNlhjRXA2TmxyaGdqdXNBTzkyamVuWnNiMzd3VmQ3VUVDWkFlWUQxREVTOW5oN0FwNjlnakhBMEF6aUlaUEtBcWVtM0xKSldnMjNTeEJqWWVBTFgzN3IxOWl6Y1h0M1NkL0hpSUxWUmNXME9HZFNXWEVZaWJvR0NTRjRLQVlUMklsUndWbzZFTUEvdFNWeFhCU3JIQXRSSFMwZzhvWjE3L2UyK1NFWGRaZDAvekViSExESVU1dVNUR3pFdU1TNlFIL0U0R0ZJY0hESTBGRWtNOUJpRERDN1EweHZpV01uSWdBc3NnTmM3R3J6SzNuMFVXbTMzNWhINXkwaUl3QVpYWnpNYURvdklBQzlsR1UxUTRrODBrQVFoSVpEQUhQVUdmb1IvbVg2U0FUUUFtL0F5ZlgzL2Z3ZUhGcjc3b05HdjVLK05laVQxM1JMbWthemsvd2JXUFZEZHpPQUFtMkJCZ1VRSW9BQVBsK01BZng1TXYzeStBTjhDNE0zNEdML21CSXNMNXpxWFYvUzlaNEZJQ3pTY0NDc2pGVThuSUFCQ0NsUHpnM0ZnTVVBUmd5Z0o5aEpIaEJhRHpqUlhOQ2hJMUwzUFZnSG03clczN256SndTd3NITkVVOUVCWEIwb01BTnoxd3h1cUVSanBYaFNOek1nREpQK2xtaU9zQW9GNmJsOG1MYmh3ZnIrODFqa2hiclRPTkY4UnJCbUFIY01JS2VIQU1oRHhaelZSUThKZHJrSFRyVGd6aFlzY3Y2eCs0M2RwWmV1SWcwZTdBTkhMUEpwbkdncENFQ1BHZWhsL0FBMU42UUdCSituTUdBQU5BVXZ0ekRBQUNpMVBuZzBwdkZPWHplUytxdFB3TnVjQi9QUm1IeW1HaFQ2a1dZTmVLaVMvVlVBTEk0aUtSTFpBb0R6QUNYYU4xMWovUHpHK04xdjYxcGxTYlFPQzhBU1RzeE9NRFBnOFRMbzBNRUI4dGh3aFV4dFppQlQ2SzBhbUtjSzVDTy9Sci9HeHJuMy9YcS9SSEFJb0JObE1nYWd4U3htd0pPTEZSUFowTUhYNU1tVUowUEZ0cWNpQUlOQ1dXWUdpR2pIRE96aGt3M2RDS0J4YmsvcE5QUU9pMndCR0lFcXdEekVnR0lZSnJiOXdNdUxPeUVxb3oyeVJxYW5UL0ZhQURCV3kzWG1WUHdOQUEzNlVsZUozLzI1WXg0Y3dpZnYxcmtJTTlEeG85RlU0ZUUxQlhYTlFqc2c4cVVjWE9ZdmlIU2Z2SFN5KzV6UktZS1l5SVUxVmdiT0ZvQk5hREx5YTJ6cnZZeFhaU3VBQUh3SzVvMTFnZmp4WS8xUno1RmpSM3U0dm1TOUR6dThPbmk1Z3FNUlVTT25tSHFpSUhDQkhTNGJYU04wWmdCMGcvRGp0MzJQSG4zN2VKVjFQY0JSaEV0Umo2emM4dFBSTEcxaUdCTW4xU2F2TG41QkFZbDJwb2M3cEN4ZktzYlBjVDVINlhUSzVPS1JNWWpCZ0JuQUhyS3ZyRmh4OSs2S2IvS3REQVp3b3ZrblJtaDBPaDM5czFKQ2lNV0VWS29uT290ZnVEOUh4Um85RVNVakQvOHBKYkVhdHdBajVSazhiOW40OG5ISW5BQkNLMzluZVNwUnBZdGlaWGZyNktiVUV4S0dVYmxwM0NSSzFBMTE1U3ZWZENINWd2cDBma1dTUzN3RW5XRUc0UE5WS2hWZnBaU2duYmF1ZW5kVEU0bXIvMTBETis2MXQ3ZDMzQmlZaGN3THlMQ3cxQkVVZzNialN0UVlkZUh4TUFMQkpmdllKWTMzK0h1QTBCeGVIS1JyOWNkVmFQU0V4RTFNSE1jZEE5dzBudTJuQTUwdzUvbFpnWUdqVWxOSGpRcEVrWUxLRGEva0RrK3hteEozRUJNU0NVRklFWDhsNy9vVWNKWkZaejFId1ZuSExZUlVPbHdqNGY5TTQ0ZmpWQkkzTkx6WWNLWnpOYXBOaFhCNFMydFFSRkJRRk5xMm9pT1hRZ3B0eE5GZVA1emdzNXpSWk9KK052QUp1WnArRGJLVXVyZ1hLRkRURVRJRjRqcGpPWFZaY2xCcmMxRHkxR2lhMHBsVTRiR3hzVHB0SVBKS2VVY3NSVEdlVklPclBZUldkOFM2dVlYempSUmpkSnZVRU56YUdweGNwdVppZFFYb1RLeHo4L1BWM2JvOVRaVWR5Zk5keDIwZE9kb2ozbFVvY28zM3FCKzVNRGNvbXRKNWhxZkZVcmt4VUVtbFNTVEh3N21HSmxTdmVxYWxlVktVSnFwbTkrU2tpbVd1TVNMWHhSNUpJN2NlWGh3ZjFObTgrSk0zbmp1Ni8vTVg0N2ZvQ2tWL3J6KzVZR1ZtYlFlbFNkTk5iMHJQb2QxVXg1WFhKOE9zenJRMFJwZFdQaS95K1ZJNlFYZTYvdmFmWnp6MytiV0RNS1ZXbHdoSmVZR3pEeGRYMVJRVU8rOGVsUmZaaEJBclpqZm9QS09wNXFZcHRVb2tweGVaMlhrOXR2MjBjejFPejhpOFVWdWRpNnNLcW9vVHQ2TDJjSUc1bmdmZmJYdkIxY0NteTVES1JDZHJWUlJ5TkVOUk92UlBGZkw2OU1UUWVCQUZOdWpTbUJOMkJ6aTFhVGRrNnRMYWw4eHpoYkRKenBsYlF2aW9LVzZMNHNMRTB5YlhNZ3ZoNE1IblQraEpXTGRoRXlTMjMwTnRQYS9YYXJXMTE5MDRodEoxZG5iU2t6YUgycEd2NVRDNlFuQWVLSUFxM2IzYTJTNlFWN09FdzJtQjVnZE5yVFluUnhzaVkybm1YdnN1K0hqN2k2NjBmV0ZiMzEyb2EwbGQ2aisydnFpaW9xSW9LVDB2c0s2bXN0clVQa0ExTExSYm5FQjExb21xVWxaMlVvVWVjQ1JLTjlETzVEVFgxQVhtamEyditNSG5CNCtpeURtVEExdWNZVWYvbVJkZU1hRGl1ZitrZWZkeTYvWVhuMy85OWVkZjNEWTNjMG5mdWxyYjNyNGxGTHlxTy9JZ3ZiWTJGZktTQndacXA4K2VZNTQ0YjkzKy9PdWIyVGUvL3VJVGUxekIvcUgzdlJmZk1LQXJvTzE3eng0OHRmT2RONCsxdGMyZE8rYllzYU1iRGwzYXRPTGZiOEd5ck9rM0JncWI1Z2NsdTVTZlh1QXlhK0JHWmVBeXVIWHpvMVdYVVBPMnVUMDlQWGZ1dEoxN1orZXB5MmRMWDNxZjdRaG4rcDQrZnZ5MHY3ZTdCeTIralg3ZHZmMVBueno1c2YvY29kL2ZoS0s0RzFwM3FHbmRISk5lZmErcUhtNSs4OEc1dmgrZlBIbmExMTF5Yk8rNXZYdmZLdW51K3dWMS8rWEtTKzlndkdIL29mMW5QOXk0Yjl1MS9PenM3UHhyMi9adFhMUHEvSWEzZm56UzlmWi8zRjZXKzVkUmNFUzAxRFBoQjhlUGR2WStmcnArdy9sVjMrLzRNbi90dEdtTHBrMmJtZjBuMUh6VHFjdStnOTNFdmZCeWErMlpWVzkzUGRsNzhWWlN1UmNzYlo1ai8vdlBublI5dGYvTTJobXZZTVg2SGVtTEhrZGZCOHVEWHZrNm1nTnVSdjdGN1U4K095Tk0vWjhqWWYrMS9VbnBwbXRtNC9hNHVZT0RQWDVRZTNOejcxYytneVFkSExGVDkxejVZKytuOE45b0ovaWZheGFocFhTWWZ4L2lpMER1UHYxczU2R2RwWS9SQnNmUllmaC80V0x2NlAzOTBaOGFmenA2ZG9iREs0ejlmd0g4UFdETVZGa3pod0FBQUFCSlJVNUVya0pnZ2c9PSIvPjwvc3ZnPgo="
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Amiri:wght@400&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --green-950: #0a1f19;
        --green-900: #0f2c24;
        --green-700: #1c4c3e;
        --green-600: #2a6553;
        --gold: #c49a55;
        --gold-600: #a97f3c;
        --gold-100: #f6ecd9;
        --cream: #faf7f1;
        --sand: #f3eee4;
        --ink: #10201b;
        --muted: #9aa9a2;
        --line: rgba(196, 154, 85, 0.22);
        --up: #7fc7a1;
        --warn: #e0b05e;
        --unknown: #8e9c96;
        --font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
        --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
        --font-arabic: 'Amiri', 'Times New Roman', serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background-color: var(--green-950);
        background-image:
          radial-gradient(1100px 620px at 50% -12%, rgba(196, 154, 85, 0.18), transparent 62%),
          radial-gradient(900px 520px at 88% 112%, rgba(42, 101, 83, 0.42), transparent 60%),
          radial-gradient(760px 460px at 4% 92%, rgba(28, 76, 62, 0.35), transparent 62%),
          linear-gradient(162deg, #0b241d 0%, #0a1f19 42%, #06130f 100%);
        color: var(--cream);
        font-family: var(--font-sans);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
        position: relative;
      }

      /* 8-point Islamic star, tiled faintly behind everything. */
      .pattern {
        position: fixed;
        inset: -10%;
        z-index: 0;
        pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80' fill='none' stroke='%23c49a55' stroke-width='0.8'%3E%3Cg transform='translate(40,40)'%3E%3Ccircle r='18'/%3E%3Crect x='-14' y='-14' width='28' height='28'/%3E%3Crect x='-14' y='-14' width='28' height='28' transform='rotate(45)'/%3E%3C/g%3E%3C/svg%3E");
        background-size: 80px 80px;
        opacity: 0.16;
        -webkit-mask-image: radial-gradient(65% 55% at 50% 42%, #000 0%, transparent 78%);
        mask-image: radial-gradient(65% 55% at 50% 42%, #000 0%, transparent 78%);
        animation: drift 90s linear infinite;
      }

      .glow {
        position: fixed;
        z-index: 0;
        border-radius: 50%;
        filter: blur(70px);
        pointer-events: none;
      }

      .glow-one {
        width: 420px;
        height: 420px;
        top: -160px;
        left: 50%;
        margin-left: -210px;
        background: radial-gradient(circle, rgba(196, 154, 85, 0.26), transparent 68%);
        animation: breathe 11s ease-in-out infinite;
      }

      .glow-two {
        width: 360px;
        height: 360px;
        bottom: -170px;
        right: -80px;
        background: radial-gradient(circle, rgba(42, 101, 83, 0.5), transparent 68%);
        animation: breathe 14s ease-in-out 1.5s infinite;
      }

      .shell {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 1140px;
        margin-inline: auto;
        padding-inline: clamp(1.15rem, 4vw, 2.5rem);
        display: flex;
        flex: 1;
        flex-direction: column;
      }

      /* ── Top bar ─────────────────────────────────────────────────────── */
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding-block: clamp(1.1rem, 2.4vw, 1.6rem);
        border-bottom: 1px solid rgba(250, 247, 241, 0.09);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        text-decoration: none;
        color: inherit;
      }

      .brand-mark {
        width: 38px;
        height: 38px;
        flex: none;
        display: grid;
        place-items: center;
        border-radius: 11px;
        border: 1px solid var(--line);
        background: #faf7f1;
        box-shadow: inset 0 1px 0 rgba(250, 247, 241, 0.08);
      }

      .brand-mark img {
        width: 26px;
        height: 26px;
        object-fit: contain;
      }

      .brand-name {
        font-family: var(--font-serif);
        font-size: 1.24rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.45rem 0.95rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(250, 247, 241, 0.045);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        font-size: 0.76rem;
        font-weight: 600;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--gold-100);
        white-space: nowrap;
      }

      .status-pill[data-state='warn'] {
        color: var(--warn);
      }

      .status-pill[data-state='down'] {
        color: #e7907a;
      }

      .pulse {
        position: relative;
        width: 8px;
        height: 8px;
        flex: none;
        border-radius: 50%;
        background: var(--up);
        box-shadow: 0 0 0 0 rgba(127, 199, 161, 0.55);
        animation: pulse 2.4s ease-out infinite;
      }

      .status-pill[data-state='warn'] .pulse {
        background: var(--warn);
      }

      .status-pill[data-state='down'] .pulse {
        background: #e7907a;
      }

      /* ── Hero ────────────────────────────────────────────────────────── */
      .hero {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding-block: clamp(3rem, 9vh, 6rem) clamp(2.5rem, 6vh, 4rem);
      }

      .emblem {
        width: clamp(92px, 12vw, 118px);
        height: clamp(92px, 12vw, 118px);
        margin-bottom: clamp(1.4rem, 3vw, 2rem);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .emblem img {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 12%;
        border-radius: 28%;
        background: #faf7f1;
        box-shadow: 0 0 28px rgba(196, 154, 85, 0.28);
        object-fit: contain;
      }

      .verse {
        margin: 0 0 0.4rem;
        font-family: var(--font-arabic);
        font-size: clamp(1.55rem, 3.4vw, 2.15rem);
        color: var(--gold);
        direction: rtl;
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
      }

      .verse-translation {
        margin: 0 0 clamp(1.6rem, 3.5vw, 2.3rem);
        font-size: 0.78rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
      }

      h1 {
        margin: 0;
        max-width: 15ch;
        font-family: var(--font-serif);
        font-weight: 500;
        font-size: clamp(2.9rem, 8.4vw, 5.6rem);
        line-height: 1.02;
        letter-spacing: -0.028em;
        color: var(--cream);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
      }

      h1 em {
        font-style: italic;
        color: var(--gold);
      }

      .lead {
        margin: clamp(1.3rem, 3vw, 1.8rem) 0 0;
        max-width: 58ch;
        font-size: clamp(1rem, 1.9vw, 1.16rem);
        color: rgba(250, 247, 241, 0.72);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.22s both;
      }

      .cta-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.8rem;
        margin-top: clamp(1.8rem, 4vw, 2.5rem);
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.88rem 1.5rem;
        border-radius: 999px;
        border: 1px solid transparent;
        font-family: var(--font-sans);
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          background-color 180ms ease,
          border-color 180ms ease;
        will-change: transform;
      }

      .btn svg {
        width: 16px;
        height: 16px;
      }

      .btn-primary {
        color: #17251f;
        background: linear-gradient(180deg, #d7b070, var(--gold));
        box-shadow: 0 14px 34px -14px rgba(196, 154, 85, 0.85);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 42px -14px rgba(196, 154, 85, 0.95);
      }

      .btn-ghost {
        color: var(--gold-100);
        border-color: var(--line);
        background: rgba(250, 247, 241, 0.035);
      }

      .btn-ghost:hover {
        transform: translateY(-2px);
        border-color: rgba(196, 154, 85, 0.5);
        background: rgba(250, 247, 241, 0.07);
      }

      /* ── Metrics ─────────────────────────────────────────────────────── */
      .metrics {
        width: min(760px, 100%);
        margin-top: clamp(2.4rem, 5vw, 3.4rem);
        border: 1px solid var(--line);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(250, 247, 241, 0.055), rgba(250, 247, 241, 0.018));
        box-shadow:
          inset 0 1px 0 rgba(250, 247, 241, 0.08),
          0 30px 70px -40px rgba(0, 0, 0, 0.9);
        -webkit-backdrop-filter: blur(14px);
        backdrop-filter: blur(14px);
        overflow: hidden;
        animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.38s both;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
      }

      .metric {
        padding: 1.15rem 1rem 1.2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.42rem;
        border-right: 1px solid rgba(250, 247, 241, 0.07);
      }

      .metric:last-child {
        border-right: 0;
      }

      .metric-label {
        font-size: 0.67rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .metric-value {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--cream);
      }

      .metric-value::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--unknown);
        box-shadow: 0 0 10px rgba(142, 156, 150, 0.6);
      }

      .metric[data-state='up'] .metric-value::before {
        background: var(--up);
        box-shadow: 0 0 10px rgba(127, 199, 161, 0.8);
      }

      .metric[data-state='warn'] .metric-value::before {
        background: var(--warn);
        box-shadow: 0 0 10px rgba(224, 176, 94, 0.8);
      }

      .metric[data-state='down'] .metric-value::before {
        background: #e7907a;
        box-shadow: 0 0 10px rgba(231, 144, 122, 0.8);
      }

      .metrics-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.5rem 1rem;
        padding: 0.7rem 1rem;
        border-top: 1px solid rgba(250, 247, 241, 0.07);
        background: rgba(10, 31, 25, 0.45);
        font-size: 0.76rem;
        color: var(--muted);
      }

      .metrics-foot strong {
        color: var(--gold-100);
        font-weight: 600;
      }

      .metrics-foot .divider {
        width: 1px;
        height: 12px;
        background: rgba(250, 247, 241, 0.14);
      }

      /* ── Footer ─────────────────────────────────────────────────────── */
      .footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem 1.5rem;
        padding-block: 1.4rem;
        border-top: 1px solid rgba(250, 247, 241, 0.09);
        font-size: 0.78rem;
        color: var(--muted);
      }

      .footer-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: rgba(250, 247, 241, 0.78);
      }

      .footer-brand .dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--gold);
      }

      .footer-links {
        display: inline-flex;
        align-items: center;
        gap: 1.15rem;
      }

      .footer a {
        color: var(--muted);
        text-decoration: none;
        transition: color 160ms ease;
      }

      .footer a:hover {
        color: var(--gold-100);
      }

      /* ── Motion ─────────────────────────────────────────────────────── */
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(127, 199, 161, 0.5);
        }
        70% {
          box-shadow: 0 0 0 9px rgba(127, 199, 161, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(127, 199, 161, 0);
        }
      }

      @keyframes breathe {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.95);
        }
        50% {
          opacity: 1;
          transform: scale(1.08);
        }
      }

      @keyframes drift {
        to {
          background-position: 320px 320px;
        }
      }

      @media (max-width: 560px) {
        .metrics-grid {
          grid-template-columns: 1fr;
        }

        .metric {
          flex-direction: row;
          justify-content: space-between;
          border-right: 0;
          border-bottom: 1px solid rgba(250, 247, 241, 0.07);
          padding: 0.85rem 1.1rem;
        }

        .metric:last-child {
          border-bottom: 0;
        }

        .footer {
          justify-content: center;
          text-align: center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="pattern" aria-hidden="true"></div>
    <div class="glow glow-one" aria-hidden="true"></div>
    <div class="glow glow-two" aria-hidden="true"></div>

    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Hifzoon home">
          <span class="brand-mark" aria-hidden="true">
            <img src="data:image/png;base64,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" alt="" width="22" height="22" />
          </span>
          <span class="brand-name">Hifzoon</span>
        </a>

        <span class="status-pill" id="status-pill" data-state="up" role="status" aria-live="polite">
          <span class="pulse" aria-hidden="true"></span>
          <span id="status-text">Live &amp; running</span>
        </span>
      </header>

      <main class="hero">
        <div class="emblem" aria-hidden="true">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAADwCAMAAAAJixmgAAADAFBMVEVMaXEBSzEBTTIBTDICSzEBSzEBSjECVU4BTDEAAAUCSzICPj0BSjABSTABfwEBSzAAODoBSzEBSjABSjC3hyYCTTIBSjABSTABSzEBSjG2hib//wy3hya4iCcCSzF/fQwCSzEBSjG3hiW2hSUCTDC4hyYBSC8BSC6rqwC3hiW2hSX/AAYOVC0BSS8BTDECSjH/igYBTDIDTDGWYBu+gS/Mq1ABSS99digqbTkGTDICTTK1hSUBSTADSzACSzECTDEBSTADSzUCSzACSzECSzECSjACSzG4iCYCSzG3hiUDSjAESzG0hCQFTTICTDEDTDEGTjEESzEESzEFMjS6iCYDSzECSjEFTDACSzEBSC8BSzECSzECSzECSzEDSzECSzEDTDEESzECSzEETTEETDECSzEBSzIBSjEESzECTTMBSzECSzECSzEA/2QDTDECTDECTDECSzECSzEBSjC3hyYGTTEHTDG6iCe4hyYGTzECTDECSzECTDG2hycCTDICSzACSzECSzECTDIDSzECSzECTDECSzECTTOxiCwCSjACSjECSzEBSjC1hyeshii6iSexhiW6iSa4hyYDTTK5iCa2hya2hia2hiW2iCYGTzECSzEBSjABSTC5iCevhCYETDG1hia4hyayhie4iCeziSoBSy+zhiYCTjMDSjC2iCiyhSexhyewhii5iCe2hya5iCa7iie4hya5iCa4hygCTDG3iCa3hiW3hycCTTK1hiW7iicCTTG5iCa2hiW5iSe3hiW2hya5iCewhSa4hya0hia2hia5iCYMTzGyhSW2hCQARi4NUDEDTzK5iScCTDKrgym2hSUCTTG0hiWxhCW0hCQDTjKMdSWefCU8WClfZyplbSwZSiqHcCYbVjRkay0BSjABTjMBTDIBSzECTzQBSzC2hicBTTMBTTIBSTACTzO3hye/jCcCUDO+iyjAjSi6iSYCUDW7iScCTjK4hybCjijBjii8iye+iiYCUTTDkCkCUjYCUDTAjCcDTjPGkSnNlSp2raTUAAAA33RSTlMA/v7+/v39A/4B/QT9/QL7Avz6+/3+/Pz7/P4B+/76Avn6+/77/f36A/37AQb5/TMC/A8DBAP8BgQM+/37QsnM/glhUTni3/te+T8v+h3W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" alt="Hifzoon" width="240" height="240" />
        </div>

        <p class="verse" lang="ar" dir="rtl">وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا</p>
        <p class="verse-translation">And recite the Qur'an with measured recitation</p>

        <h1>Hifzoon is <em>live</em>.</h1>

        <p class="lead">
          The purpose-built Quran academy platform is online and serving requests — live
          classes, a synchronized Mushaf, and progress reports families can trust.
        </p>

        <div class="cta-row">
          <a class="btn btn-primary" href="${primaryHref}">
            ${primaryLabel}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
          <a class="btn btn-ghost" href="${docs}">
            API documentation
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
        </div>

        <div class="metrics">
          <div class="metrics-grid">
            <div class="metric" id="metric-api" data-state="up">
              <span class="metric-label">API</span>
              <span class="metric-value" id="metric-api-value">Live</span>
            </div>
            <div class="metric" id="metric-db" data-state="unknown">
              <span class="metric-label">Database</span>
              <span class="metric-value" id="metric-db-value">Monitored</span>
            </div>
            <div class="metric" id="metric-redis" data-state="unknown">
              <span class="metric-label">Realtime</span>
              <span class="metric-value" id="metric-redis-value">Monitored</span>
            </div>
          </div>
          <div class="metrics-foot">
            <span>Uptime <strong id="uptime">running now</strong></span>
            <span class="divider" aria-hidden="true"></span>
            <span>Health <strong id="checked">served from this instance</strong></span>
          </div>
        </div>
      </main>

      <footer class="footer">
        <span class="footer-brand">
          <span class="dot" aria-hidden="true"></span>
          © ${new Date().getUTCFullYear()} Hifzoon
        </span>
        <span>Purpose-built for huffaz, families and scholars.</span>
        <span class="footer-links">
          <a href="${docs}">Docs</a>
          <a href="/api/v1/health/ready">Health</a>
        </span>
      </footer>
    </div>

    <script>
      (function () {
        var pill = document.getElementById('status-pill');
        var statusText = document.getElementById('status-text');
        var nodes = {
          api: document.getElementById('metric-api'),
          apiValue: document.getElementById('metric-api-value'),
          db: document.getElementById('metric-db'),
          dbValue: document.getElementById('metric-db-value'),
          redis: document.getElementById('metric-redis'),
          redisValue: document.getElementById('metric-redis-value'),
          uptime: document.getElementById('uptime'),
          checked: document.getElementById('checked'),
        };

        function setMetric(node, valueNode, state, text) {
          if (!node || !valueNode) return;
          node.setAttribute('data-state', state);
          valueNode.textContent = text;
        }

        function formatUptime(seconds) {
          var total = Math.max(0, Math.floor(Number(seconds) || 0));
          var days = Math.floor(total / 86400);
          var hours = Math.floor((total % 86400) / 3600);
          var minutes = Math.floor((total % 3600) / 60);
          if (days > 0) return days + 'd ' + hours + 'h';
          if (hours > 0) return hours + 'h ' + minutes + 'm';
          return minutes > 0 ? minutes + 'm' : 'just now';
        }

        fetch('/api/v1/health/ready', {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then(function (body) {
            var report = body && body.data ? body.data : body || {};
            var checks = report.checks || {};
            var ok = report.status === 'ok';

            setMetric(nodes.api, nodes.apiValue, 'up', 'Operational');
            setMetric(
              nodes.db,
              nodes.dbValue,
              checks.database && checks.database.status === 'up' ? 'up' : 'down',
              checks.database && checks.database.status === 'up' ? 'Connected' : 'Unavailable',
            );
            setMetric(
              nodes.redis,
              nodes.redisValue,
              checks.redis && checks.redis.status === 'up' ? 'up' : 'down',
              checks.redis && checks.redis.status === 'up' ? 'Connected' : 'Unavailable',
            );

            nodes.uptime.textContent = formatUptime(report.uptimeSeconds);
            nodes.checked.textContent = 'checked just now';

            pill.setAttribute('data-state', ok ? 'up' : 'warn');
            statusText.textContent = ok ? 'Live & running' : 'Live · degraded';
          })
          .catch(function () {
            setMetric(nodes.api, nodes.apiValue, 'up', 'Serving this page');
            setMetric(nodes.db, nodes.dbValue, 'unknown', 'Not reported');
            setMetric(nodes.redis, nodes.redisValue, 'unknown', 'Not reported');
            nodes.checked.textContent = 'checks unavailable';
          });
      })();
    </script>
  </body>
</html>
`;
}
