# Failed Captioning and Provider jobs keep data, warn clearly, and retry

If Captioning dies, the Video and any partial Caption stay; the job is marked failed with a readable error and can be retried (resume if possible). If a Provider job dies, Caption and Search are untouched; Improved Caption and Summary are committed only when finished; a half write is discarded; the user sees a readable error and can retry. A missing Provider is off, not failed. Deleting the Video because a job failed would throw away playback, Notes, and Playback Position for a recoverable error.
