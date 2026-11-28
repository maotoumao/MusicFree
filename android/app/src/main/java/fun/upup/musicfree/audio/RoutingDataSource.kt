package `fun`.upup.musicfree.audio

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSink
import androidx.media3.datasource.cache.CacheDataSource

/**
 * 按 scheme 分流的上游 DataSource：
 * - http(s)：cacheEnabled 时走 CacheDataSource（边下边播缓存），否则直连 OkHttp；
 * - file/content/asset/rawresource 等本地：走 DefaultDataSource，不进缓存。
 * open() 时按 dataSpec.uri.scheme 选 delegate（此时 URI 已被 ResolvingDataSource 改写成真实地址）。
 */
@OptIn(UnstableApi::class)
class RoutingDataSource private constructor(
    private val cacheHttp: DataSource,
    private val directHttp: DataSource,
    private val local: DataSource,
    private val cacheEnabled: () -> Boolean,
) : DataSource {

    private var delegate: DataSource? = null

    override fun addTransferListener(transferListener: TransferListener) {
        cacheHttp.addTransferListener(transferListener)
        directHttp.addTransferListener(transferListener)
        local.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val d = when (dataSpec.uri.scheme?.lowercase()) {
            "http", "https" -> if (cacheEnabled()) cacheHttp else directHttp
            else -> local
        }
        delegate = d
        return d.open(dataSpec)
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        (delegate ?: throw IllegalStateException("read before open")).read(buffer, offset, length)

    override fun getUri(): Uri? = delegate?.uri

    override fun getResponseHeaders(): Map<String, List<String>> =
        delegate?.responseHeaders ?: emptyMap()

    override fun close() {
        try {
            delegate?.close()
        } finally {
            delegate = null
        }
    }

    /** 每次 createDataSource 造一套 delegate；cacheEnabled 由 provider 动态读（setup 可切）。 */
    @OptIn(UnstableApi::class)
    class Factory(
        context: Context,
        private val cache: Cache,
        private val httpFactory: DataSource.Factory,
        private val cacheEnabled: () -> Boolean,
    ) : DataSource.Factory {
        private val appContext = context.applicationContext

        override fun createDataSource(): DataSource {
            val cacheHttp = CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(httpFactory)
                .setCacheWriteDataSinkFactory(CacheDataSink.Factory().setCache(cache))
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
                .createDataSource()
            val directHttp = httpFactory.createDataSource()
            val local = DefaultDataSource.Factory(appContext).createDataSource()
            return RoutingDataSource(cacheHttp, directHttp, local, cacheEnabled)
        }
    }
}
